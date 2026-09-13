# sms-notes-webhook

Text a number, the note lands in Airtable as a card in the "To Do" column.

Twilio SMS -> Cloudflare Worker -> Airtable REST API -> Airtable Kanban board.

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

## Checking a deploy

A plain GET returns a health check, so you can confirm the Worker is live before
Twilio is pointed at it:

    curl https://sms-notes-webhook.<subdomain>.workers.dev
