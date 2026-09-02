import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

const FROM_ADDRESS = 'inquiries@northstarsolutions.online';
const TO_ADDRESS    = 'northstarsolutions.work@gmail.com';

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch (err) {
    return json({ ok: false, error: 'invalid payload' }, 400);
  }

  const body = [
    'Name: '      + (data.name     || '-'),
    'Business: '  + (data.business || '-'),
    'Email: '     + (data.email    || '-'),
    'Phone: '     + (data.phone    || '-'),
    'Industry: '  + (data.industry || '-'),
    'Team size: ' + (data.team     || '-'),
    'Budget: '    + (data.budget   || '-'),
    '',
    'What they want fixed:',
    data.problem || '-'
  ].join('\n');

  const msg = createMimeMessage();
  msg.setSender({ name: 'Northstar Digital Website', addr: FROM_ADDRESS });
  msg.setRecipient(TO_ADDRESS);
  msg.setSubject('Project inquiry — ' + (data.name || 'website'));
  msg.addMessage({ contentType: 'text/plain', data: body });

  const message = new EmailMessage(FROM_ADDRESS, TO_ADDRESS, msg.asRaw());

  try {
    await env.SEND_EMAIL.send(message);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
