# sms-notes-webhook

Text a number, the note lands in Airtable as a card in the "To Do" column.

Twilio SMS -> Cloudflare Worker -> Airtable REST API -> Airtable Kanban board.

## Routes

| Route | Purpose |
|---|---|
| `POST /sms` | Twilio inbound webhook. Signature-verified. |
| `GET /` | The board UI |
| `GET /health` | Deploy health check |
| `POST /api/auth` | Exchange the access code for a session cookie |
| `GET /api/notes` | List notes (session required) |
| `PATCH /api/notes/:id` | Update a note's Status or Message (session required) |

## Statuses

All four live in `src/config.js` and nowhere else. They must match the Airtable
single-select options **exactly**, capitalisation included: it is `In progress`,
not `In Progress`.

    Uncategorized  ->  To Do  ->  In progress  ->  Done

Inbound texts land in **Uncategorized**. Moving one to To Do is a deliberate act
of triage, so raw captured thoughts never silently become a work queue.

Two protections mean an Airtable schema change cannot cost you a note:

- Reads normalise case, so `in PROGRESS` maps to `In progress` and an unknown or
  missing value becomes `Uncategorized` rather than erroring.
- If an inbound write is rejected because the Status option was renamed or
  removed, the Worker immediately retries **without** Status and logs
  `AIRTABLE_FALLBACK`. The note is saved with a blank Status instead of lost.
  Twilio never retries an inbound SMS, so a failed write is permanent.

To change your workflow, edit `src/config.js` and the Airtable field together.

## The board

A dark, Harmony-branded Kanban served straight from the Worker, so the Airtable
token never reaches the browser. Move cards between columns, edit note text in
place. Narrow screens get column tabs instead of three columns.

Access is a shared code held in the `BOARD_ACCESS_CODE` secret, exchanged for an
HMAC-signed HttpOnly cookie good for 30 days. It **fails closed**: if the secret
is unset, nobody gets in. This is a placeholder until harmonytechgroup.com domain
authentication replaces it.

## Tests

    npm test

Covers routing, the Twilio signature path (valid, forged, empty body, emoji),
session issue and rejection, field allow-listing on updates, and fail-closed
behaviour when no access code is configured.

## How it works

Twilio POSTs a form-encoded body to this Worker when a text arrives. The Worker
verifies the `X-Twilio-Signature` header so nobody can hit the URL directly and
write junk into the base, creates an Airtable record with `Status = To Do`, and
returns empty TwiML so Twilio logs a clean success.

`Received At` is an Airtable "Created time" field, so Airtable stamps it and the
Worker never sends a timestamp.

## Secrets

Set these in the Cloudflare dashboard under the Worker's Settings, Variables and
Secrets. Never commit them.

| Name | What it is |
|---|---|
| `AIRTABLE_TOKEN` | Airtable personal access token, scoped to this base only |
| `AIRTABLE_BASE_ID` | `appju47gVBOPF0zHC` |
| `TWILIO_AUTH_TOKEN` | From the Twilio console, used only to verify signatures |
| `PUBLIC_URL` | Optional. Only set if signature validation fails because Cloudflare reports a different URL than Twilio signed. |

The Airtable table is addressed by ID (`tblzxRcl6C4OuZbmd`) in `src/index.js`, so
renaming the table in Airtable will not break anything.

## Deploying

Pushing to `main` deploys automatically via Cloudflare Workers Builds.

## Local development

    cp .dev.vars.example .dev.vars   # then fill in the values
    npm install
    npm run dev

## Troubleshooting

Signature failures log a `SIGNATURE_FAILED` entry to Cloudflare (Worker →
Observability) with the URL used, whether the auth token is set and its length,
and the computed vs received signature. No secret values are logged. The public
403 response stays a bare "Forbidden".

Things that have actually gone wrong here before:

- **Secrets set in the wrong place.** Cloudflare's *Build* variables are not the
  same as the Worker's *Variables and Secrets*. Only the latter reach `env` at
  runtime. Setting them with `npx wrangler secret put NAME` avoids the ambiguity
  entirely. Verify with `npx wrangler secret list`.
- **Account SID pasted as the auth token.** The SID is 34 chars starting `AC`
  and is displayed in plain text; the Auth Token is 32 hex chars and is hidden
  behind a reveal toggle. Every signature fails if you grab the wrong one.
- **A Messaging Service hijacking inbound routing.** If the number belongs to a
  Messaging Service whose inbound setting is "Send a webhook", that URL wins and
  the number's own webhook is ignored silently. Set the service to "Defer to
  sender's webhook", or point the service itself at this Worker. Not both.

## Checking a deploy

A plain GET returns a health check, so you can confirm the Worker is live before
Twilio is pointed at it:

    curl https://sms-notes-webhook.<subdomain>.workers.dev
