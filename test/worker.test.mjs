import worker from '../src/index.js';

const AUTH = 'a'.repeat(32);          // pretend Twilio auth token
const CODE = 'harmony-test-code-123';
const env = {
  TWILIO_AUTH_TOKEN: AUTH,
  AIRTABLE_TOKEN: 'pat_fake',
  AIRTABLE_BASE_ID: 'appju47gVBOPF0zHC',
  BOARD_ACCESS_CODE: CODE,
};

let captured = [];
globalThis.fetch = async (url, opts = {}) => {
  captured.push({ url: String(url), method: opts.method, body: opts.body });
  if (opts.method === 'GET' || !opts.method) {
    return new Response(JSON.stringify({ records: [
      { id: 'recAAAAAAAAAAAAAA', createdTime: '2026-09-13T12:00:00.000Z',
        fields: { Message: 'Do laundry', Status: 'To Do', 'Received At': '2026-09-13T12:00:00.000Z', From: '+14058816768' } },
      { id: 'recBBBBBBBBBBBBBB', createdTime: '2026-09-12T09:00:00.000Z',
        fields: { Message: 'Call Mike', Status: 'Done', 'Received At': '2026-09-12T09:00:00.000Z' } },
    ] }), { headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ id: 'recAAAAAAAAAAAAAA' }), { headers: { 'content-type': 'application/json' } });
};

async function twilioSig(url, params) {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(AUTH), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const call = (path, init) => worker.fetch(new Request('https://sms-notes-webhook.gus-bfe.workers.dev' + path, init), env);

console.log('\n== routing ==');
let r = await call('/health');
check('GET /health returns 200 ok', r.status === 200 && (await r.text()).includes('ok'));

r = await call('/');
let html = await r.text();
check('GET / serves the board', r.status === 200 && html.includes('Harmony') && html.includes('<!doctype html>'));
check('board page sets a CSP', Boolean(r.headers.get('content-security-policy')));

r = await call('/nope');
check('unknown path 404s', r.status === 404);

console.log('\n== twilio webhook (regression) ==');
const url = 'https://sms-notes-webhook.gus-bfe.workers.dev/sms';
const params = { Body: 'Do laundry', From: '+14058816768', To: '+14055001757',
                 MessageSid: 'SM1', AccountSid: 'AC1', MessagingServiceSid: 'MG1' };
captured = [];
r = await call('/sms', { method: 'POST', headers: { 'X-Twilio-Signature': await twilioSig(url, params) },
                          body: new URLSearchParams(params) });
let xml = await r.text();
check('valid signature accepted', r.status === 200, 'status ' + r.status);
check('returns TwiML', xml.includes('<Response></Response>'));
check('wrote one Airtable record', captured.length === 1, JSON.stringify(captured.length));
let sent = captured[0] ? JSON.parse(captured[0].body) : {};
check('Status is To Do', sent.fields?.Status === 'To Do');
check('Message preserved', sent.fields?.Message === 'Do laundry');
check('From preserved', sent.fields?.From === '+14058816768');
check('no timestamp sent (Airtable stamps it)', !('Received At' in (sent.fields || {})));

captured = [];
r = await call('/sms', { method: 'POST', headers: { 'X-Twilio-Signature': 'WRONGWRONGWRONGWRONGWRONGWR=' },
                          body: new URLSearchParams(params) });
check('bad signature rejected with 403', r.status === 403);
check('403 body leaks nothing', (await r.text()) === 'Forbidden');
check('no Airtable write on bad signature', captured.length === 0);

const empty = { ...params, Body: '   ' };
captured = [];
r = await call('/sms', { method: 'POST', headers: { 'X-Twilio-Signature': await twilioSig(url, empty) },
                          body: new URLSearchParams(empty) });
check('empty body still filed', r.status === 200 && JSON.parse(captured[0].body).fields.Message === '(empty message)');

const emoji = { ...params, Body: 'Call Mike \u{1F527} re: rack' };
captured = [];
r = await call('/sms', { method: 'POST', headers: { 'X-Twilio-Signature': await twilioSig(url, emoji) },
                          body: new URLSearchParams(emoji) });
check('emoji survives intact', r.status === 200 && JSON.parse(captured[0].body).fields.Message === 'Call Mike \u{1F527} re: rack');

console.log('\n== board auth ==');
r = await call('/api/notes');
check('notes require a session', r.status === 401);

r = await call('/api/auth', { method: 'POST', body: JSON.stringify({ code: 'wrong' }) });
check('wrong code denied', r.status === 401);

r = await call('/api/auth', { method: 'POST', body: JSON.stringify({ code: CODE }) });
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
check('right code issues a session', r.status === 200 && cookie.startsWith('harmony_notes_session='));
check('cookie is HttpOnly + Secure + SameSite', /HttpOnly/.test(r.headers.get('set-cookie')) &&
      /Secure/.test(r.headers.get('set-cookie')) && /SameSite=Lax/.test(r.headers.get('set-cookie')));

const withCookie = { headers: { cookie } };
r = await call('/api/notes', withCookie);
let data = await r.json();
check('notes load with session', r.status === 200 && data.notes.length === 2);
check('notes mapped correctly', data.notes[0].message === 'Do laundry' && data.notes[0].status === 'To Do');
check('missing From tolerated', data.notes[1].from === '');

r = await call('/api/notes', { headers: { cookie: 'harmony_notes_session=9999999999999.tampered' } });
check('forged cookie rejected', r.status === 401);

console.log('\n== updates ==');
r = await call('/api/notes/recAAAAAAAAAAAAAA', { method: 'PATCH', ...withCookie,
      body: JSON.stringify({ Status: 'In Progress' }) });
check('valid status change accepted', r.status === 200);

r = await call('/api/notes/recAAAAAAAAAAAAAA', { method: 'PATCH', ...withCookie,
      body: JSON.stringify({ Status: 'Deleted' }) });
check('invalid status rejected', r.status === 400);

r = await call('/api/notes/recAAAAAAAAAAAAAA', { method: 'PATCH', ...withCookie,
      body: JSON.stringify({ Message: '   ' }) });
check('empty message rejected', r.status === 400);

r = await call('/api/notes/notarecord', { method: 'PATCH', ...withCookie,
      body: JSON.stringify({ Status: 'Done' }) });
check('malformed record id rejected', r.status === 400);

captured = [];
r = await call('/api/notes/recAAAAAAAAAAAAAA', { method: 'PATCH', ...withCookie,
      body: JSON.stringify({ Status: 'Done', Message: 'edited', Notes: 'injected', id: 'hax' }) });
let patched = JSON.parse(captured[0].body).fields;
check('only allow-listed fields forwarded',
      Object.keys(patched).sort().join(',') === 'Message,Status', JSON.stringify(patched));

r = await call('/api/notes/recAAAAAAAAAAAAAA', { method: 'PATCH',
      body: JSON.stringify({ Status: 'Done' }) });
check('update requires a session', r.status === 401);

console.log('\n== fails closed ==');
const noCode = { ...env, BOARD_ACCESS_CODE: undefined };
r = await worker.fetch(new Request('https://x.dev/api/notes'), noCode);
check('no access code set => notes locked', r.status === 401);
r = await worker.fetch(new Request('https://x.dev/api/auth', { method: 'POST', body: JSON.stringify({ code: '' }) }), noCode);
check('no access code set => auth refuses', r.status === 503);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
