/* Northstar Solutions — the whole live site.
   Static files (index.html, styles.css, motion.js, assets/...) are served
   by the built-in ASSETS binding below. The one dynamic route is the
   contact form, which sends mail through Cloudflare's own Email Workers
   rather than a third-party form service — nothing but Cloudflare ever
   sees a submission. */
import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

const FROM_ADDRESS = 'inquiries@northstarsolutions.online';
/* Temporary: the business inbox is locked out, so inquiries route to the
   personal address that's verified in Email Routing right now. Swap this
   back to northstarsolutions.work@gmail.com (and re-verify it there) once
   access to that inbox is restored. */
const TO_ADDRESS    = 'digitalzaviofficial@gmail.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/inquiry' && request.method === 'POST') {
      return handleInquiry(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleInquiry(request, env) {
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
  msg.setSender({ name: 'Northstar Solutions Website', addr: FROM_ADDRESS });
  msg.setRecipient(TO_ADDRESS);
  msg.setSubject('Project inquiry — ' + (data.name || 'website'));
  msg.addMessage({ contentType: 'text/plain', data: body });

  const message = new EmailMessage(FROM_ADDRESS, TO_ADDRESS, msg.asRaw());

  /* env.SEND_EMAIL is not code — it's the send_email binding declared in
     wrangler.jsonc. Keep it there, not in the dashboard: `wrangler deploy`
     is declarative, so a binding added by hand in the dashboard is wiped
     by the next deploy. The destination must also be verified under
     Email -> Email Routing before anything sends. */
  if (!env.SEND_EMAIL) {
    return json({ ok: false, error: 'email binding not configured' }, 500);
  }

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
