import nodemailer from 'nodemailer';
import { startMockMailServer } from './mock-mail.mjs';

const messages = [];

const smtpHost = process.env.GYF_SMTP_HOST?.trim();
const mailTransport = process.env.GYF_MAIL_TRANSPORT || (smtpHost ? 'smtp' : 'unconfigured');
if (!['disabled', 'local', 'smtp', 'unconfigured'].includes(mailTransport)) throw new Error('GYF_MAIL_TRANSPORT must be smtp, local or disabled, or left unset.');
export const emailEnabled = mailTransport !== 'disabled';
// Verification and password reset are mandatory everywhere except the explicit `disabled` opt-out used by tests.
export const emailEnforced = emailEnabled;
// `unconfigured` is production without SMTP values: accounts cannot be verified, and the app says so.
export const emailConnected = mailTransport === 'smtp' || mailTransport === 'local';
const localMailboxEnabled = mailTransport === 'local';
export const emailDeliveryMode = localMailboxEnabled ? 'local-test' : mailTransport;
// Development and test only. These are placeholders, never a real account.
export const mockMailAccount = {
  user: process.env.GYF_MOCK_MAIL_USER?.trim() || 'mock-mailbox@mock.getyourfit.invalid',
  pass: process.env.GYF_MOCK_MAIL_PASS || 'mock-mailbox-password',
};
const runnerToken = process.env.GYF_MAILBOX_RUNNER_TOKEN;
if (localMailboxEnabled && process.env.NODE_ENV === 'production') throw new Error('The mock mailbox is available only in development and test mode.');
if (localMailboxEnabled && !runnerToken) throw new Error('GYF_MAILBOX_RUNNER_TOKEN is required for the mock mailbox.');

let deliver;
let mailFrom;
if (localMailboxEnabled) {
  const configuredPort = Number(process.env.GYF_MOCK_SMTP_PORT || 1025);
  if (!Number.isInteger(configuredPort) || configuredPort < 0 || configuredPort > 65535) throw new Error('GYF_MOCK_SMTP_PORT must be a valid TCP port, or 0 to choose a free one.');
  const { port } = await startMockMailServer({ port: configuredPort, credentials: mockMailAccount, messages });
  const mailer = nodemailer.createTransport({ host: '127.0.0.1', port, secure: false, ignoreTLS: true, auth: mockMailAccount });
  mailFrom = `GetYourFit <${mockMailAccount.user}>`;
  deliver = (message) => mailer.sendMail(message);
} else if (mailTransport === 'smtp') {
  const host = smtpHost;
  mailFrom = process.env.GYF_MAIL_FROM?.trim();
  const port = Number(process.env.GYF_SMTP_PORT || 587);
  const secureSetting = process.env.GYF_SMTP_SECURE;
  const user = process.env.GYF_SMTP_USER;
  const password = process.env.GYF_SMTP_PASS;
  if (!host || !mailFrom) throw new Error('GYF_SMTP_HOST and GYF_MAIL_FROM are required when GYF_MAIL_TRANSPORT is smtp.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GYF_SMTP_PORT must be a valid TCP port.');
  if (secureSetting && !['true', 'false'].includes(secureSetting.toLowerCase())) throw new Error('GYF_SMTP_SECURE must be true or false.');
  if (Boolean(user) !== Boolean(password)) throw new Error('GYF_SMTP_USER and GYF_SMTP_PASS must be set together.');
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
  if (!deliver) return Promise.reject(new Error(emailEnabled ? 'Email delivery is not connected.' : 'Email delivery is disabled.'));
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
