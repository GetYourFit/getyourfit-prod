import nodemailer from 'nodemailer';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

const messages = [];
function parsedRecipients(addresses = []) {
  return addresses.flatMap(({ address, group }) => [
    ...(typeof address === 'string' ? [address.trim().toLowerCase()] : []),
    ...parsedRecipients(group ?? []),
  ]);
}

const mailTransport = process.env.GYF_MAIL_TRANSPORT || 'disabled';
if (!['disabled', 'local', 'smtp'].includes(mailTransport)) throw new Error('GYF_MAIL_TRANSPORT must be disabled, local or smtp.');
export const emailEnabled = mailTransport !== 'disabled';
const localMailboxEnabled = mailTransport === 'local';
export const emailDeliveryMode = localMailboxEnabled ? 'local-test' : mailTransport;
const runnerToken = process.env.GYF_MAILBOX_RUNNER_TOKEN;
if (localMailboxEnabled && process.env.NODE_ENV === 'production') throw new Error('The local mail catcher is available only in development and test mode.');
if (localMailboxEnabled && !runnerToken) throw new Error('GYF_MAILBOX_RUNNER_TOKEN is required for the local mail catcher.');

let deliver;
let mailFrom;
if (localMailboxEnabled) {
  const mailServer = new SMTPServer({
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    onConnect(session, callback) {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(session.remoteAddress)) return callback(new Error('Local mail only.'));
      callback();
    },
    onData(stream, _session, callback) {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', async () => {
        try {
          const mail = await simpleParser(Buffer.concat(chunks));
          messages.unshift({
            subject: mail.subject || 'GetYourFit message',
            recipients: parsedRecipients(mail.to?.value),
            text: mail.text || '',
          });
          messages.splice(50);
          callback();
        } catch {
          callback(new Error('The local mail catcher could not read this message.'));
        }
      });
    },
  });
  await new Promise((resolve, reject) => {
    mailServer.once('error', reject);
    mailServer.listen(1025, '127.0.0.1', () => {
      mailServer.removeListener('error', reject);
      resolve();
    });
  });
  const mailer = nodemailer.createTransport({ host: '127.0.0.1', port: 1025, secure: false, ignoreTLS: true });
  mailFrom = 'GetYourFit <wardrobe@localhost>';
  deliver = (message) => mailer.sendMail(message);
} else if (mailTransport === 'smtp') {
  const host = process.env.SMTP_HOST?.trim();
  mailFrom = process.env.SMTP_FROM?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secureSetting = process.env.SMTP_SECURE;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  if (!host || !mailFrom) throw new Error('SMTP_HOST and SMTP_FROM are required when GYF_MAIL_TRANSPORT is smtp.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid TCP port.');
  if (secureSetting && !['true', 'false'].includes(secureSetting.toLowerCase())) throw new Error('SMTP_SECURE must be true or false.');
  if (Boolean(user) !== Boolean(password)) throw new Error('SMTP_USER and SMTP_PASS must be set together.');
  const secure = secureSetting ? secureSetting.toLowerCase() === 'true' : port === 465;
  const mailer = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    ...(user ? { auth: { user, pass: password } } : {}),
  });
  deliver = (message) => mailer.sendMail(message);
}

const pendingMail = new Map();
export function sendMail({ to, subject, text }) {
  if (!deliver) return Promise.reject(new Error('Email delivery is disabled.'));
  const recipient = String(to).trim().toLowerCase();
  const delivery = Promise.resolve().then(() => deliver({ from: mailFrom, to, subject, text }));
  const deliveries = pendingMail.get(recipient) ?? new Set();
  const trackedDelivery = delivery.finally(() => {
    deliveries.delete(trackedDelivery);
    if (deliveries.size === 0) pendingMail.delete(recipient);
  });
  deliveries.add(trackedDelivery);
  pendingMail.set(recipient, deliveries);
  return trackedDelivery;
}

export const localMailbox = () => messages;
export async function settleMailForAccountDeletion(email) {
  const normalized = String(email).trim().toLowerCase();
  while (pendingMail.has(normalized)) await Promise.allSettled([...pendingMail.get(normalized)]);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].recipients.includes(normalized)) messages.splice(index, 1);
  }
}
