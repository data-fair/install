# Production recipe

Runs Data Fair on a single server exposed to the internet, over HTTPS.

Compared to the [local recipe](../local/), it adds:

- **HTTPS**: nginx runs in the [jonasal/nginx-certbot](https://github.com/JonasAlfredsson/docker-nginx-certbot) image, which obtains and renews letsencrypt certificates and redirects HTTP to HTTPS (`nginx/main.conf.template`, `nginx/portals.conf.template`).
- **Reverse proxy cache**: nginx caches the responses that data-fair marks as cacheable (`nginx/http.conf`, `nginx/proxy.conf`, `REVERSE_PROXY_CACHE` in `compose.yaml`).
- **Usage metrics**: nginx sends a log line for every API call to the metrics daemon through a unix socket, and the metrics service shows the statistics in data-fair (`log_format metrics` in `nginx/http.conf`, `access_log` in `nginx/proxy.conf`, the `metrics` and `metrics-daemon` services).
- **Real mails**: through your SMTP server instead of a local mailbox.
- **Portals on your domain**: `https://<portal id>.portal.<domain>`, with a wildcard certificate (see [portals](../../docs/portals.md)).

The server and worker of data-fair run in separate containers, like in the local recipe. For more worker capacity, see [operations](../../docs/operations.md#scaling).

## Before you start

- A server that meets the [requirements](../../README.md#requirements), with ports 80 and 443 open to the internet.
- DNS records pointing to the server, for `<domain>` and `*.portal.<domain>` (see [portals](../../docs/portals.md#dns-records)).
- An SMTP server to send mails.
- API credentials for your DNS provider, used for the wildcard certificate of the portals (see [portals](../../docs/portals.md#wildcard-certificate)).

## Start

1. Get this folder:

   ```sh
   git clone https://github.com/data-fair/install.git
   cd install/recipes/production
   ```

2. Create your `.env` file:

   ```sh
   cp .env.example .env
   sed -i "s/^SECRET=CHANGE_ME/SECRET=$(openssl rand -hex 32)/; s/^CIPHER_PASSWORD=CHANGE_ME/CIPHER_PASSWORD=$(openssl rand -hex 32)/" .env
   ```

   Then edit `.env`:

   | Variable | |
   |---|---|
   | `DOMAIN` | your domain name, e.g. `data.example.org` |
   | `BASE_URL` | keep `https://${DOMAIN}` |
   | `SECRET`, `CIPHER_PASSWORD` | random values generated above, keep them secret and never change them afterwards: `CIPHER_PASSWORD` encrypts data stored in the databases |
   | `ADMINS` | emails of the super administrators, a JSON array |
   | `CONTACT_EMAIL` | shown to users, sender of the mails, and owner of the letsencrypt certificates |
   | `MAILS_TRANSPORT` | your SMTP server, a JSON [nodemailer configuration](https://nodemailer.com/smtp) |
   | `CERTBOT_DNS_PROVIDER` | the certbot DNS plugin of your DNS provider, e.g. `ovh` or `cloudflare` |
   | `DATA_FAIR_API_KEY` | only for the [bonus services](../../docs/bonus-services.md) |

3. Create the `certbot-dns.ini` file with the API credentials of your DNS provider, as explained in [portals](../../docs/portals.md#wildcard-certificate). Create it before the first start: otherwise Docker creates a directory in its place.

4. Start the services:

   ```sh
   docker compose up -d
   docker compose ps
   ```

5. Follow the creation of the certificates:

   ```sh
   docker compose logs -f nginx
   ```

6. Open `https://<domain>`.

## First login

The super administrators listed in `ADMINS` exist from the start, without a password. On the login page, enter the admin email and choose to renew the password. The mail goes through your SMTP server.

## Bonus services

To add the plugins registry, processings and catalogs, see [bonus services](../../docs/bonus-services.md).

## Operations

Logs, updates, backups and troubleshooting: see [operations](../../docs/operations.md).
