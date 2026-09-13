/**
 * Twilio SMS -> Airtable webhook.
 *
 * Twilio POSTs a form-encoded body when a text arrives. We verify the request
 * really came from Twilio, then create an Airtable record with Status "To Do",
 * then hand back empty TwiML so Twilio records a clean success.
 *
 * Secrets (set in the Cloudflare dashboard):
 *   AIRTABLE_TOKEN     Airtable personal access token, scoped to this base
 *   AIRTABLE_BASE_ID   e.g. appju47gVBOPF0zHC
 *   TWILIO_AUTH_TOKEN  from the Twilio console, used only to verify signatures
 *   PUBLIC_URL         optional, see validateTwilioSignature below
 */

const TABLE_ID = 'tblzxRcl6C4OuZbmd';
const AIRTABLE_API = 'https://api.airtable.com/v0';

const TWIML_OK =
  '<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>';

export default {
  async fetch(request, env) {
    // A plain GET is a health check, handy for confirming a deploy went live
    // before Twilio is wired up to anything.
    if (request.method === 'GET') {
      return new Response('sms-notes-webhook ok\n', {
        headers: { 'content-type': 'text/plain' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Read the form body once, as text, because signature validation needs the
    // raw parameters and we cannot consume the body twice.
    let params;
    try {
      const raw = await request.text();
      params = Object.fromEntries(new URLSearchParams(raw));
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const signature = request.headers.get('X-Twilio-Signature');
    const valid = await validateTwilioSignature(
      env.TWILIO_AUTH_TOKEN,
      signature,
      env.PUBLIC_URL || request.url,
      params
    );

    if (!valid) {
      console.warn('Rejected request with invalid Twilio signature');
      return new Response('Forbidden', { status: 403 });
    }

    // Twilio always sends Body, but it can be an empty string (for example a
    // picture message with no caption). Keep the record rather than dropping it.
    const body = (params.Body || '').trim();
    const message = body.length > 0 ? body : '(empty message)';

    const fields = {
      Message: message,
      Status: 'To Do',
    };
    if (params.From) {
      fields.From = params.From;
    }

    try {
      await createAirtableRecord(env, fields);
    } catch (err) {
      // Return 500 so the failure is visible in the Twilio debugger rather than
      // silently swallowed. Twilio does not retry inbound SMS webhooks.
      console.error('Airtable write failed:', err.message);
      return new Response('Airtable write failed', { status: 500 });
    }

    return new Response(TWIML_OK, {
      headers: { 'content-type': 'text/xml; charset=utf-8' },
    });
  },
};

async function createAirtableRecord(env, fields) {
  const url = `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${TABLE_ID}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ fields, typecast: true }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Airtable returned ${res.status}: ${detail}`);
  }

  return res.json();
}

/**
 * Twilio signs each request: base64(HMAC-SHA1(authToken, url + sortedParams)),
 * where sortedParams is every POST field concatenated as key+value in
 * alphabetical order by key.
 *
 * The URL must match what Twilio was configured with, character for character.
 * If Cloudflare ever reports a different URL than Twilio signed (a trailing
 * slash, a proxy rewrite), set the PUBLIC_URL secret to the exact configured
 * value to override it.
 */
async function validateTwilioSignature(authToken, signature, url, params) {
  if (!authToken || !signature) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return timingSafeEqual(expected, signature);
}

/** Compare without leaking timing information about where a mismatch occurred. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
