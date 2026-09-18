# Nonprofits for JCF Connectivity

A small, public petition site. Nonprofits sign to say they'd benefit from
Jewish Communal Fund (JCF) allowing ACH linkage into a nonprofit's Chariot
deposit account for gift processing.

> **Note:** as of 2026-09-18 this app was simplified to focus solely on
> nonprofits + ACH linkage. It previously also supported a donor-facing
> sign-up flow and a DAFpay ask. That version is fully preserved at the git
> tag/branch `pre-simplification-donor-dafpay` if it ever needs to come back
> — nothing was deleted, and the database columns for it (`type`,
> `wants_dafpay`, `years_as_account_holder`, etc.) are still in the schema,
> just unused by the current UI.

Stack: Node.js + Express + EJS templates + Postgres. No build step, no
frontend framework — deliberately minimal so it's easy to host and cheap to
run on Railway.

## How it works

- **Public page (`/`)** — explains the ask, shows live counts, has the sign-up
  form, and shows a "wall" of approved nonprofits (with logo, blurb, and
  optional mission statement).
- **New submissions** are saved with `status = pending`. They count toward the
  public totals immediately but don't appear on the wall until you approve
  them — this keeps spam/junk off the visible list while still showing
  momentum. You can change this in `server.js` if you'd rather auto-publish.
- **Admin panel (`/admin`)** — single shared password (set via `ADMIN_PASSWORD`).
  From here you can approve, hide, delete, and edit any submission — including
  adding a logo URL and a mission/vision statement that shows up on the public
  card.
- **Storage** — everything lives in Postgres (`signers` table). Any visitor
  anywhere sees the same live data; nothing is per-browser or in memory, so
  it's safe to run multiple instances and to redeploy without losing data.

## Local development

```bash
npm install
cp .env.example .env
# Point DATABASE_URL at a local Postgres db, and set ADMIN_PASSWORD / SESSION_SECRET
npm start
```

The app creates its own tables on startup (see `db/schema.sql`), so there's no
separate migration step.

## Deploying on Railway

1. **Push this folder to a GitHub repo** (Railway deploys from GitHub, or you
   can use the Railway CLI to deploy straight from your machine — see below
   for the CLI path if you'd rather skip GitHub).

2. **Create a new Railway project** → "Deploy from GitHub repo" → pick the
   repo.

3. **Add a Postgres database**: in the project, click "+ New" → "Database" →
   "Add PostgreSQL". Railway automatically injects `DATABASE_URL` into your
   app service's environment — you don't need to copy/paste it.

4. **Set environment variables** on the app service (Settings → Variables):
   - `ADMIN_PASSWORD` — the password you'll use to log into `/admin`. Pick
     something you wouldn't mind a teammate typing over Slack, but not
     something guessable.
   - `SESSION_SECRET` — any long random string. Generate one locally with:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `PGSSL` — leave unset/`false` (Railway's internal Postgres connection
     doesn't need SSL).

   Railway sets `PORT` and `DATABASE_URL` for you automatically — you don't
   need to add those.

5. **Deploy.** Railway will run `npm install` then `npm start` (see
   `Procfile`). Once it's live, Railway gives you a `*.up.railway.app` URL —
   you can add a custom domain later under Settings → Networking.

6. Visit `/admin`, log in with your `ADMIN_PASSWORD`, and you're ready to
   start approving and enriching submissions.

### Alternative: deploy via Railway CLI (no GitHub needed)

```bash
npm install -g @railway/cli
railway login
railway init
railway add          # add a Postgres plugin when prompted
railway up
railway variables set ADMIN_PASSWORD=your-password-here
railway variables set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

## Notes on the design

- The palette (`public/css/styles.css`) is a placeholder inspired by
  Chariot's public brand — deep navy + a warm gold accent — kept deliberately
  understated since this is meant to read as a nonprofit-led effort, not a
  Chariot marketing page. Chariot is mentioned once, quietly, in the footer.
  Swap the CSS variables at the top of `styles.css` for exact brand hex codes
  whenever you have them.
- The tone throughout is intentionally collaborative rather than
  confrontational — "we'd love to," not "JCF is failing us." Feel free to
  tune the copy in `views/index.ejs`.
- Logos are added by pasting an image URL in the admin panel (no file
  uploads) — this keeps the app filesystem-free, which matters on Railway
  since its filesystem isn't persistent across deploys. If you'd rather
  upload image files directly, that needs an object storage bucket (e.g. AWS
  S3 or Cloudflare R2) — happy to wire that up if you want it later.
- A natural next step you mentioned: letting a signer *pick* their nonprofit
  from a known list (rather than free-typing a name) so the data is
  structured from day one. That's straightforward to add later — for now
  everything funnels through the admin panel by design.

## Things to double check before sending the link out

- Change `ADMIN_PASSWORD` from any placeholder before sharing the link
  publicly.
- Try submitting a test signature yourself once it's live, then approve it
  from `/admin`, to confirm the full loop works in production.

Redeployed: 2026-09-16T20:32:47Z
