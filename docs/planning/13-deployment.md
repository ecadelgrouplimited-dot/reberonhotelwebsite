# 13 · Deployment and go-live

How the suite goes onto a server, and what to plug in when real data and keys arrive. Everything below is built and has been verified from a clean checkout. The only work left is supplying the domain, the server and the provider keys.

## 1. The shape

One small VPS (ADR-006): 2 vCPU, 4 GB RAM and 40 GB of disk is plenty for ten rooms. It runs Docker with seven containers:

| Container | What it is | Public address |
|---|---|---|
| `caddy` | HTTPS (automatic Let's Encrypt) and reverse proxy | ports 80 and 443 |
| `web` | The website (Next.js, standalone) | `https://reberonhotel.com` |
| `admin` | The House (Next.js, standalone). It proxies `/v1` to the API, so its cookies stay first-party | `https://house.reberonhotel.com` |
| `api` | NestJS API, job queues and crons, plus the media files | `https://api.reberonhotel.com` |
| `postgres` | PostgreSQL 16 (volume `pgdata`) | internal only |
| `redis` | Queues and cache, persisted with AOF (volume `redisdata`) | internal only |
| `migrate` | One-off job: runs migrations and loads reference data. It never loads demo data | none |

Files: `infra/docker-compose.prod.yml`, `infra/docker/*.Dockerfile`, `infra/Caddyfile`, `infra/deploy.sh`, `infra/backup.sh` and `.env.production.example`.

## 2. First deploy

1. **DNS.** Point `A` records for `reberonhotel.com`, `www.reberonhotel.com`, `house.reberonhotel.com` and `api.reberonhotel.com` at the server.
2. **Server.**
   ```sh
   apt install docker.io docker-compose-v2 git
   git clone git@github.com:ecadelgrouplimited-dot/reberon_hotel_website.git /opt/reberon
   ```
3. **Secrets.**
   ```sh
   cp .env.production.example .env.production
   ```
   - Fill in the domains.
   - Generate each secret with `openssl rand -base64 48`.
   - Keep a copy of `DATA_KEY` somewhere offline. Guest ID numbers and the integrations vault cannot be read without it. The API refuses to start in production without it.
4. **Deploy.** Run `./infra/deploy.sh`. It:
   - builds the API
   - starts Postgres and Redis
   - runs migrations and loads reference data
   - starts the API
   - builds the website against the running API (pages are pre-rendered from real content)
   - starts everything behind Caddy
5. **The owner account.** On a fresh database there are no users. Create the owner once:
   ```sh
   docker compose --env-file .env.production -f infra/docker-compose.prod.yml run --rm \
     -e OWNER_EMAIL=denis@reberonhotel.com -e OWNER_NAME="Denis Mayamba" migrate npx tsx seed/owner.ts
   ```
   It prints a one-time password. The owner signs in and changes it under Account, then invites the others from People.
6. **Backups.** Add `infra/backup.sh` to cron (see the header of the script), and copy `/var/backups/reberon` off the server.

For every release after that: `git pull && ./infra/deploy.sh`. Migrations are forward-only, and `migrate` never touches content the owner has written.

Notes:
- The images build with the classic Docker builder. BuildKit is not required.
- The first build takes about 3 minutes for the API and about 2 minutes each for web and admin.

## 3. Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. Starts Postgres, Redis and Mailpit.
2. Builds the packages and the API, migrates, and loads the demo seed.
3. Starts the API.
4. Builds the website and the House.
5. Typechecks and lints everything, then runs the API integration tests.

On `main` it also proves that the production images build. Nothing is pushed to a registry yet; add that when the server exists.

## 4. Go-live: what to plug in

Nothing here needs code. Each item is a screen in the House or a line in `.env.production`.

| When you have… | Do this | Where |
|---|---|---|
| Pesapal merchant keys | Enter the consumer key and secret, choose **Sandbox**, then **Test connection**. Make one real small payment, then switch to **Live**. Pesapal's IPN (payment notification) is registered automatically on the first order. | House → Admin → Integrations |
| Africa's Talking account | Username, API key and (once approved) sender ID. **Test connection** shows the balance. | Integrations |
| WhatsApp Cloud API number | Phone number ID and a permanent token. In WhatsApp Manager, submit each WhatsApp message from House → Messages as a template, with fields as `{{1}}`, `{{2}}`… in the same order. Then enter each approved template's name on its message. | Integrations, then Messages |
| An email provider | SMTP host, port, user and password. **Test connection**, then send a test from any message. | Integrations |
| Real room numbers and floors | Adjust the physical rooms (the demo has 101–105 and 201–205). | Seed / Rooms |
| Rates | Set the rates. Then turn on **Online booking**. | Calendar & rates, then Settings → Features |
| A camera walk (Matterport, Kuula, video) | Add it as the **Live** tour in the same place as the image walk. It replaces the drawings everywhere. Then turn on **Virtual tours**. | Website → Virtual tours, Settings → Features |
| SMS live | Optionally turn on **Text a code before showing a stay**. | Settings → Features |
| TIN and VAT registration | Enter the registered company name and TIN. If the hotel is VAT-registered, switch on "show the VAT included" so invoices carry the VAT line. | Settings → Receipts and invoices |
| A receipt printer at the desk | Any 80 mm thermal printer that the browser can print to. Set "Default paper" to 80 mm. | Settings → Receipts and invoices |
| Staff | Add everyone, including people who never sign in. Adjust each person's access, hours and end date. | Admin → People and access |
| Launch day | Remove every demo row: `docker compose … run --rm migrate npx tsx seed/purge.ts`. This also removes the demo receipts and restarts document numbering at 00001. The seed users are kept so you can still sign in; switch them off in People. | Server |

Until a channel is connected, nothing breaks:
- Payments stay simulated outside production. In production they refuse politely and point guests to WhatsApp.
- SMS and WhatsApp messages are written to **Sent messages** as "not connected". For WhatsApp, staff get a one-tap link that sends the message from the hotel phone.

## 5. Operating notes

- **Health.** `GET https://api.reberonhotel.com/v1/health` reports the database and Redis. The API container has a Docker health check against it.
- **Logs.** Use `docker compose … logs -f api`. Every staff action is also in House → Audit log.
- **Restore.**
  ```sh
  pg_restore -U reberon -d reberon --clean < db-XXXX.dump
  ```
  Run it inside the `postgres` container. Untar the media archive into the `media` volume.
- **Timezone.** Business dates are Africa/Kampala, whatever the server's clock is set to.
