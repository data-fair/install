# Portals

Portals are data portals, public or private, built on top of Data Fair. You create and edit them in the portals menu of data-fair. The portals manager stores them, and the portal service renders them.

## How portal host names work

Each portal is served on its own host name:

- `https://<portal id>.portal.<domain>` for the published portal;
- `https://<portal id>.draft.portal.<domain>` for its draft version, while it is being edited;
- optionally a custom domain, like `https://data.my-city.org`.

The portal service finds which portal to render from the host name of the request, matched against `PORTAL_URL_PATTERN` (`https://{subdomain}.portal.<domain>`). If there's no match, it looks for a portal with that exact custom domain.

On a portal host, nginx serves the portal at the root and forwards `/data-fair/`, `/simple-directory/`, `/events/`, `/openapi-viewer/` and `/processings/` to the corresponding services (`nginx/portal-locations.conf`). Visitors of a portal log in and use the APIs without leaving its domain.

## DNS records

For the domain `data.example.org`, create two records pointing to your server:

```
data.example.org.            A   <server IP>
*.portal.data.example.org.   A   <server IP>
```

The wildcard record also covers the draft host names (`<id>.draft.portal.data.example.org`).

The local recipe needs no DNS: browsers resolve every `*.localhost` name to your computer.

## Wildcard certificate

Letsencrypt only issues a wildcard certificate (`*.portal.<domain>`) through a DNS challenge. Certbot proves that you own the domain by creating a temporary DNS record through the API of your DNS provider. The main domain uses the usual HTTP challenge and needs nothing more.

The production recipe relies on the conventions of [jonasal/nginx-certbot](https://github.com/JonasAlfredsson/docker-nginx-certbot/blob/master/docs/certbot_authenticators.md):

- `nginx/portals.conf.template` declares the certificate `/etc/letsencrypt/live/portals.dns-<provider>/`. The `.dns-<provider>` suffix selects the certbot DNS plugin used for this certificate.
- The credentials of the plugin are read from `/etc/letsencrypt/<provider>.ini`. The recipe mounts your `certbot-dns.ini` file there.
- `CERTBOT_DNS_PROVIDER` in `.env` gives `<provider>`.
- The main domain and the portals wildcard are in separate files (`main.conf.template` and `portals.conf.template`). The image requests one certificate per file with the host names of that file, and the main certificate must not include the wildcard.

Supported providers are those whose certbot DNS plugin is included in the image: `bunny`, `cloudflare`, `digitalocean`, `dnsimple`, `dnsmadeeasy`, `duckdns`, `gandi`, `gehirn`, `godaddy`, `google`, `hetzner`, `infomaniak`, `inwx`, `ionos`, `linode`, `luadns`, `namecheap`, `nsone`, `ovh`, `porkbun`, `powerdns`, `rfc2136`, `route53` and `sakuracloud` (in `jonasal/nginx-certbot:6-alpine`, September 2026). The format of `certbot-dns.ini` is given in the documentation of each plugin.

Example for OVH (`CERTBOT_DNS_PROVIDER=ovh`), with an [API token](https://certbot-dns-ovh.readthedocs.io/) allowed to edit the DNS zone:

```ini
dns_ovh_endpoint = ovh-eu
dns_ovh_application_key = ...
dns_ovh_application_secret = ...
dns_ovh_consumer_key = ...
```

Example for Cloudflare (`CERTBOT_DNS_PROVIDER=cloudflare`), with an [API token](https://certbot-dns-cloudflare.readthedocs.io/) allowed to edit the DNS zone:

```ini
dns_cloudflare_api_token = ...
```

Protect the file: `chmod 600 certbot-dns.ini`.

If DNS challenges fail because of slow DNS propagation, set `CERTBOT_DNS_PROPAGATION_SECONDS` (e.g. `60`) in the `environment` of the `nginx` service.

### Bring your own certificate

If your DNS provider has no certbot plugin, you can use a wildcard certificate obtained elsewhere:

1. Put `fullchain.pem` and `privkey.pem` in a `certs/portals/` folder next to `compose.yaml`.
2. Mount it in the `nginx` service: `- ./certs/portals:/etc/nginx/certs/portals:ro`.
3. In `nginx/portals.conf.template`, point `ssl_certificate` and `ssl_certificate_key` to `/etc/nginx/certs/portals/...`, and remove `ssl_trusted_certificate`. Paths outside `/etc/letsencrypt/live/` are not managed by certbot, so renewing the certificate is up to you.

## Custom domains

A portal can also be served on a custom domain:

1. Create a DNS record for the custom domain pointing to your server.
2. Add a server block for it in a new file, e.g. `nginx/portal-my-city.conf.template`, mounted in `/etc/nginx/templates/` like the other templates. Use its own certificate name, which letsencrypt validates with the usual HTTP challenge:

   ```nginx
   server {
     listen 443 ssl;
     listen [::]:443 ssl;
     http2 on;
     server_name data.my-city.org;
     ssl_certificate /etc/letsencrypt/live/portal-my-city/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/portal-my-city/privkey.pem;
     ssl_trusted_certificate /etc/letsencrypt/live/portal-my-city/chain.pem;

     include /etc/nginx/includes/proxy.conf;
     include /etc/nginx/includes/portal-locations.conf;
   }
   ```

3. Add the custom domain as a network alias of the `nginx` service (next to `${DOMAIN}`), so that the other services can reach it.
4. Restart nginx: `docker compose up -d nginx`.
5. As super administrator in admin mode, set the domain of the portal in its settings.
