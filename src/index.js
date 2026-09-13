/**
 * Harmony Notes.
 *
 *   POST /sms            Twilio inbound SMS webhook, files the text into Airtable
 *   GET  /               The board UI
 *   GET  /health         Deploy health check
 *   POST /api/auth       Exchange the access code for a session cookie
 *   GET  /api/notes      List notes (session required)
 *   PATCH /api/notes/:id Update a note's Status or Message (session required)
 *
 * Secrets (set with: npx wrangler secret put NAME)
 *   AIRTABLE_TOKEN      Airtable personal access token, scoped to this base
 *   AIRTABLE_BASE_ID    appju47gVBOPF0zHC
 *   TWILIO_AUTH_TOKEN   Twilio Auth Token (32 hex chars, NOT the AC... SID)
 *   BOARD_ACCESS_CODE   Shared code that opens the board
 *   PUBLIC_URL          Optional, overrides the URL used for signature checks
 */

import { BOARD_HTML } from './board.js';
import { STATUSES, INBOX_STATUS, normalizeStatus } from './config.js';

const TABLE_ID = 'tblzxRcl6C4OuZbmd';
const AIRTABLE_API = 'https://api.airtable.com/v0';
const SESSION_DAYS = 30;
const COOKIE = 'harmony_notes_session';

const TWIML_OK = '<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    if (path === '/sms') {
      if (method === 'POST') return handleTwilio(request, env);
      if (method === 'GET') return text('sms-notes-webhook ok\n');
      return text('Method not allowed', 405);
    }

    if (path === '/health') return text('sms-notes-webhook ok\n');

    if (path === '/api/auth' && method === 'POST') return handleAuth(request, env);

    if (path === '/api/notes' && method === 'GET') {
      if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);
      return listNotes(env);
    }

    if (path.startsWith('/api/notes/') && method === 'PATCH') {
      if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);
      return updateNote(request, env, decodeURIComponent(path.slice('/api/notes/'.length)));
    }

    if (path === '/' && method === 'GET') {
      return new Response(BOARD_HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          // The page loads only its own inline code plus Google Fonts.
          'content-security-policy':
            "default-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
        },
      });
    }

    return text('Not found', 404);
  },
};

/* ------------------------------------------------------------------ Twilio */

async function handleTwilio(request, env) {
  let params;
  try {
    params = Object.fromEntries(new URLSearchParams(await request.text()));
  } catch {
    return text('Bad request', 400);
  }

  const signature = request.headers.get('X-Twilio-Signature');
  const urlUsed = env.PUBLIC_URL || request.url;
  const check = await validateTwilioSignature(env.TWILIO_AUTH_TOKEN, signature, urlUsed, params);

  if (!check.valid) {
    // Private log only. The response body stays a bare "Forbidden" so the
    // endpoint never reports its own configuration to whoever is probing it.
    // No secret values here: an HMAC output does not reveal its key, and the
    // token is reported only by length (34 = someone pasted the Account SID).
    console.warn(
      'SIGNATURE_FAILED ' +
        JSON.stringify({
          urlUsed,
          rawRequestUrl: request.url,
          publicUrlOverrideSet: Boolean(env.PUBLIC_URL),
          authTokenPresent: Boolean(env.TWILIO_AUTH_TOKEN),
          authTokenLength: (env.TWILIO_AUTH_TOKEN || '').length,
          signatureHeaderPresent: Boolean(signature),
          receivedSignature: signature,
          computedSignature: check.expected,
          paramKeys: Object.keys(params).sort(),
        })
    );
    return text('Forbidden', 403);
  }

  const body = (params.Body || '').trim();
  const fields = {
    Message: body.length > 0 ? body : '(empty message)',
    Status: INBOX_STATUS,
  };
  if (params.From) fields.From = params.From;

  try {
    await airtable(env, 'POST', '', { fields, typecast: true });
  } catch (err) {
    console.error('AIRTABLE_FAILED ' + err.message);
    // A note arriving matters more than which column it lands in. If the write
    // failed because the Status option was renamed or removed in Airtable, save
    // it again without Status rather than losing it: Twilio never retries an
    // inbound SMS, so a 500 here means that note is gone for good.
    try {
      const { Status, ...withoutStatus } = fields;
      await airtable(env, 'POST', '', { fields: withoutStatus, typecast: true });
      console.warn('AIRTABLE_FALLBACK note saved without Status; check Status options match src/config.js');
    } catch (err2) {
      console.error('AIRTABLE_FALLBACK_FAILED ' + err2.message);
      return text('Airtable write failed', 500);
    }
  }

  return new Response(TWIML_OK, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
}

/* -------------------------------------------------------------------- auth */

async function handleAuth(request, env) {
  // Fail closed: with no code configured, nobody gets in.
  if (!env.BOARD_ACCESS_CODE) {
    console.error('BOARD_ACCESS_CODE is not set; refusing all board access');
    return json({ error: 'not_configured' }, 503);
  }

  let submitted = '';
  try {
    submitted = String((await request.json()).code || '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (!timingSafeEqual(submitted, env.BOARD_ACCESS_CODE)) {
    // Small constant delay to blunt rapid guessing.
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'denied' }, 401);
  }

  const expires = Date.now() + SESSION_DAYS * 86400_000;
  const token = expires + '.' + (await signSession(env.BOARD_ACCESS_CODE, expires));

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json',
      'set-cookie':
        COOKIE + '=' + token +
        '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + SESSION_DAYS * 86400,
    },
  });
}

async function authorized(request, env) {
  if (!env.BOARD_ACCESS_CODE) return false;

  const raw = (request.headers.get('cookie') || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;

  const value = raw.slice(COOKIE.length + 1);
  const dot = value.indexOf('.');
  if (dot < 1) return false;

  const expires = Number(value.slice(0, dot));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  const expected = await signSession(env.BOARD_ACCESS_CODE, expires);
  return timingSafeEqual(value.slice(dot + 1), expected);
}

async function signSession(code, expires) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode('harmony-notes:' + expires));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ------------------------------------------------------------------- notes */

async function listNotes(env) {
  const query =
    '?pageSize=100' +
    '&sort%5B0%5D%5Bfield%5D=' + encodeURIComponent('Received At') +
    '&sort%5B0%5D%5Bdirection%5D=desc';

  try {
    const data = await airtable(env, 'GET', query);
    const notes = (data.records || []).map((r) => ({
      id: r.id,
      message: r.fields.Message || '(empty message)',
      status: normalizeStatus(r.fields.Status),
      receivedAt: r.fields['Received At'] || r.createdTime,
      from: r.fields.From || '',
    }));
    return json({ notes });
  } catch (err) {
    console.error('AIRTABLE_LIST_FAILED ' + err.message);
    return json({ error: 'airtable_failed' }, 502);
  }
}

async function updateNote(request, env, id) {
  if (!/^rec[A-Za-z0-9]{10,}$/.test(id)) return json({ error: 'bad_id' }, 400);

  let patch;
  try {
    patch = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  // Allow-list the writable fields rather than passing the body through.
  const fields = {};
  if (typeof patch.Status === 'string') {
    if (!STATUSES.includes(patch.Status)) return json({ error: 'bad_status' }, 400);
    fields.Status = patch.Status;
  }
  if (typeof patch.Message === 'string') {
    const msg = patch.Message.trim();
    if (!msg) return json({ error: 'empty_message' }, 400);
    fields.Message = msg.slice(0, 10000);
  }
  if (!Object.keys(fields).length) return json({ error: 'nothing_to_update' }, 400);

  try {
    const rec = await airtable(env, 'PATCH', '/' + id, { fields, typecast: true });
    return json({ ok: true, id: rec.id });
  } catch (err) {
    console.error('AIRTABLE_PATCH_FAILED ' + err.message);
    return json({ error: 'airtable_failed' }, 502);
  }
}

async function airtable(env, method, suffix, body) {
  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${TABLE_ID}${suffix}`, {
    method,
    headers: {
      authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Airtable returned ${res.status}: ${await res.text()}`);
  return res.json();
}

/* ---------------------------------------------------------------- signature */

/**
 * Twilio signs each request: base64(HMAC-SHA1(authToken, url + sortedParams)),
 * where sortedParams is every POST field concatenated as key+value in
 * alphabetical order by key. The URL must match what Twilio was configured
 * with, character for character; PUBLIC_URL overrides it if they ever diverge.
 */
async function validateTwilioSignature(authToken, signature, url, params) {
  if (!authToken || !signature) return { valid: false, expected: null };

  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return { valid: timingSafeEqual(expected, signature), expected };
}

/* ----------------------------------------------------------------- helpers */

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function text(body, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
