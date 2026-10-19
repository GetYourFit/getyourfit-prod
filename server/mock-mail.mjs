import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

const loopbackAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

function parsedRecipients(addresses = []) {
  return addresses.flatMap(({ address, group }) => [
    ...(typeof address === 'string' ? [address.trim().toLowerCase()] : []),
    ...parsedRecipients(group ?? []),
  ]);
}

// The mock mailbox for development and tests: a loopback-only SMTP server that behaves like a provider by refusing
// senders that do not authenticate with the mock account, and keeps the newest 50 messages in memory.
export async function startMockMailServer({ port, credentials, messages }) {
  const server = new SMTPServer({
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onConnect(session, callback) {
      if (!loopbackAddresses.includes(session.remoteAddress)) return callback(new Error('Local mail only.'));
      callback();
    },
    onAuth(auth, _session, callback) {
      if (auth.username === credentials.user && auth.password === credentials.pass) return callback(null, { user: auth.username });
      callback(new Error('Invalid mock mailbox credentials.'));
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
          callback(new Error('The mock mailbox could not read this message.'));
        }
      });
    },
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return { port: server.server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
}
