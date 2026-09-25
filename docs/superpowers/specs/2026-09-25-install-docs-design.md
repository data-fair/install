# Data Fair installation docs – design

Date: 2026-09-25
Status: approved in conversation, pending written-spec review

## Context

The installation documentation used to live in `data-fair/data-fair` (`doc/pages/install/*`, `doc/static/install-resources/*`), published to https://data-fair.github.io/4/install/install. It was removed from data-fair in commit `d578520d4` (2025-10-07) and is badly outdated: it targets data-fair 4, simple-directory 7, notify 3, portals 1, processings 1, thumbor, Elasticsearch 7.17 and MongoDB 4.4.

The rest of the old site is covered elsewhere: tutorials on docs.koumoul.com, product description and architecture on datafair.cloud. The data-fair.github.io site itself is retired separately (home page with links, see "Related work").

This repository (`data-fair/install`) becomes the maintained home of the installation docs.

## Goals

- Up-to-date, runnable Docker Compose recipes for self-hosting the current stack.
- A validation protocol that actually runs the recipes end to end, executable locally by a maintainer or an agent.
- A maintenance protocol that detects drift (new service versions, config changes) and says how to handle it.

## Non-goals

- Kubernetes / Helm guidance.
- A static site generator: docs are markdown read on github.com.
- A duplicated configuration reference: we link to each service's config schema.
- Running the full recipe validation in CI: it runs locally only. CI only runs the cheap weekly drift check and lint.
- Backup service, agents, mcp, maps, tileserver, legacy portals v1, notify, thumbor.
- French translation (docs are in English).

## Current stack facts (as of 2026-09-25)

Established from the service repos under `~/data-fair/*` and the production infrastructure (read-only reference).

| Service | Image | Prefix | Notes |
|---|---|---|---|
| data-fair (server + worker) | `ghcr.io/data-fair/data-fair:6` | `/data-fair` (strippable) | `MODE=server` / `worker`; `FILES_STORAGE=fs` (default) on a shared `/data` volume; websockets; health `GET /api/v1/ping` |
| simple-directory | `ghcr.io/data-fair/simple-directory:8` | `/simple-directory` | requires `CIPHER_PASSWORD`; `MANAGE_SITES=true` + `SECRET_SITES` for portals; health via `/.well-known/jwks.json` |
| events | `ghcr.io/data-fair/events:1` | `/events` | replaces notify; mails sent through simple-directory `/api/mails`; websockets; health `GET /api/ping` |
| openapi-viewer | `ghcr.io/data-fair/openapi-viewer:2` | `/openapi-viewer` (strippable) | `ALLOWED_URLS`; TCP health |
| capture | `ghcr.io/data-fair/capture:3` | `/capture` (strippable) | `shm_size`, seccomp profile or `--no-sandbox`; TCP health |
| portals manager | `ghcr.io/data-fair/portals/manager:2` | `/portals-manager` | `PORTAL_URL_PATTERN`; health `GET /api/ping` |
| portals portal | `ghcr.io/data-fair/portals/portal:2` | served at `/` of portal hosts | `NUXT_*` runtime config; portal hosts also proxy `/data-fair`, `/simple-directory`, `/events`, `/openapi-viewer`, `/processings`; health `GET /ping` |
| metrics (api + daemon) | `ghcr.io/data-fair/metrics:2`, `.../metrics/daemon:2` | `/metrics` | nginx writes syslog to a unix datagram socket shared with the daemon; specific `log_format metrics` |
| registry (bonus) | `ghcr.io/data-fair/registry:0.x` | `/registry` | fs storage, runs as uid 1000; health `GET /api/ping` |
| processings (bonus) | `ghcr.io/data-fair/processings:6`, `.../processings/worker:6` | `/processings` | needs registry; worker needs a data-fair superadmin API key; health `GET /api/v1/_ping` |
| catalogs (bonus) | `ghcr.io/data-fair/catalogs:1`, `.../catalogs/worker:1` | `/catalogs` | needs registry; worker needs a data-fair API key; health `GET /api/ping` |
| MongoDB | `mongo:8.0` | – | |
| Elasticsearch | `ghcr.io/data-fair/elasticsearch:8.19.x` | – | custom image with `ingest-attachment`; single node, security disabled on the internal network |

Cross-cutting rules:

- Every service listens on 8080; set `OBSERVER_ACTIVE=false` (or equivalent) where Prometheus is not scraped.
- Services other than data-fair, capture and openapi-viewer derive their public URL from the forwarded host + fixed prefix: nginx must not strip their prefix, and they must share the main domain.
- Shared secrets must match between services (`SECRET_EVENTS`, `SECRET_SENDMAILS`, `SECRET_IDENTITIES`, `SECRET_SITES`, `SECRET_CATALOGS`, `SECRET_REGISTRY`/`SECRET_INTERNAL_SERVICES`). The recipes keep this simple by reusing a few `.env` variables (a shared `SECRET` and a `CIPHER_PASSWORD`) for all of them.
- The simple-directory `IDENTITIES_WEBHOOKS` point to data-fair, events, and (bonus) catalogs and processings.
- nginx location blocks carry the standard headers (Host, X-Forwarded-*, X-Real-IP, websocket upgrade), `proxy_buffering off` + `X-Accel-Buffering` passthrough, `proxy_request_buffering off`, `client_max_body_size 0`, `proxy_read_timeout 600s`, `proxy_buffer_size 32k`.

These facts are a starting point; the implementation verifies each one against the service repos before relying on it.

## Repository layout

```
README.md                     overview, hardware/software requirements, choosing a recipe,
                              links (architecture → datafair.cloud, user docs → docs.koumoul.com,
                              config schemas → each service repo), "Last validated" line
recipes/local/
  README.md                   step-by-step for the local recipe
  compose.yaml
  .env.example
  nginx.conf
  capture-seccomp.json        (if the seccomp approach is kept)
recipes/production/
  README.md                   step-by-step for the production recipe
  compose.yaml                core + portals + metrics
  compose.bonus.yaml          overlay: registry + processings + catalogs
  .env.example
  nginx.conf                  main domain + wildcard portal server blocks + metrics logging
  capture-seccomp.json        (if kept)
docs/
  portals.md                  DNS records, wildcard certificate via DNS challenge, custom domains
  bonus-services.md           registry, processings, catalogs; koumoul.com subscription for the
                              full plugin registry
  operations.md               logs, super-admin, mail setup, data volumes and backup pointers,
                              scaling hints
  upgrading.md                from the old v4 recipes (ES 7→8, Mongo 4.4→8, notify→events,
                              thumbor removal, portals v1→v2) and per-change entries later
MAINTENANCE.md                the maintenance and validation protocol
validated-versions.json       exact service versions of the last successful validation
package.json                  Node 24, ESM, npm scripts: validate, check-versions, lint
eslint.config.js              neostandard, like the rest of the stack
.github/workflows/drift.yaml  weekly drift check + lint (cron + manual trigger)
scripts/
  validate.ts                 end-to-end validation of a recipe (compose orchestration + report)
  check-versions.ts           drift detection: tags and config schema diffs
  lint.ts                     compose config check for every recipe/overlay + markdown link check
  lib/                        small shared helpers (compose runner, registries API, schema diff)
test/
  production.override.yaml    test-only overrides for the production recipe
  smoke/*.spec.ts             Playwright smoke tests
  reports/                    git-ignored run reports
```

Tooling follows the stack's conventions: Node 24 running `.ts` files directly (native type stripping, no build step), ESM, `@playwright/test` for the smoke tests, and neostandard eslint. There is no shell scripting beyond one-line npm scripts.

## Recipes

### local

- Target: try Data Fair on a workstation, `http://localhost`.
- Services: nginx, data-fair (server and worker), simple-directory, events, openapi-viewer, capture, portals (manager and portal), mongo, elasticsearch, maildev.
- Portals are served at `http://{sub}.portal.localhost`: browsers resolve `*.localhost` to 127.0.0.1, so no DNS setup is needed.
- Mails go to a maildev container exposed at `/mails/`.
- `.env.example` has `BASE_URL`, one `SECRET` reused for all the service secrets, `CIPHER_PASSWORD`, and `ADMINS`.
- Every service has a compose `healthcheck`.
- User flow in the README: copy the folder, `cp .env.example .env`, set the secret, `docker compose up -d`, `docker compose ps`, open http://localhost, set the superadmin password through maildev, log in.

### production

- Target: one VM exposed to the internet with a domain name.
- Services: the local set without maildev, plus metrics (api and daemon). nginx uses `jonasal/nginx-certbot`.
- TLS:
  - The main domain uses the HTTP-01 challenge.
  - The portal wildcard (`*.portal.<domain>`) uses a DNS-01 challenge through a certbot DNS plugin; credentials sit in a mounted file. `docs/portals.md` explains it, using OVH and Cloudflare as examples.
- nginx:
  - a reverse proxy cache for data-fair (`REVERSE_PROXY_CACHE=true`);
  - the metrics `log_format`;
  - `access_log` to the unix socket, on a volume shared with the metrics daemon.
- Mail: real SMTP through `MAILS_TRANSPORT`/`MAILS_FROM`; no maildev.
- data-fair runs as separate server and worker containers.
- Healthchecks and `restart: unless-stopped` everywhere.

### bonus overlay (`compose.bonus.yaml`)

- Adds registry, processings (api and worker) and catalogs (api and worker), with their shared volumes, and wires them into data-fair (`PRIVATE_*_URL`, secrets, identities webhooks).
- It is turned on with `docker compose -f compose.yaml -f compose.bonus.yaml ...`. The nginx locations for these services ship in `nginx.conf` and return 502 until the overlay runs; `docs/bonus-services.md` explains this.
- `docs/bonus-services.md` explains:
  - what each service does;
  - that the useful plugins come from mirroring the Koumoul registry, which requires a koumoul.com subscription and its API key;
  - how to configure the mirror;
  - the data-fair superadmin API key the workers need.

## Validation protocol

`npm run validate -- <local|production> [--bonus] [--keep]` (`scripts/validate.ts`):

1. Checks prerequisites (docker, compose v2, free ports 80/443, available memory) and fails early with a clear message.
2. Copies the recipe to a temp directory and creates `.env` from `.env.example` with random secrets, the same way the README tells users to.
3. For production, adds `test/production.override.yaml`. It replaces nginx-certbot with plain nginx over HTTP, sets the domain to `localhost` and portals to `*.portal.localhost`, and adds maildev in place of SMTP. The nginx config, metrics socket wiring and service configuration are otherwise used as shipped.
4. Runs the README's commands (`docker compose ... up -d`) and waits for every container to be healthy, with a timeout. On failure it collects `docker compose ps` and logs.
5. Runs the Playwright smoke tests in `test/smoke/` (one Playwright project per recipe, base URL and flags passed through env):
   - The superadmin sets a password through the maildev reset mail and logs in.
   - Upload a small CSV, wait for the dataset to be finalized, then query its lines through the API.
   - The dataset API doc opens in openapi-viewer.
   - A capture/thumbnail request returns an image.
   - Portals: create a portal in the manager and open it at its `*.portal.localhost` URL.
   - Production only: after some requests, the metrics daemon has received log lines.
   - `--bonus`:
     - registry, processings and catalogs answer their ping endpoints;
     - their UIs load for the superadmin;
     - plugin mirroring is tested only when `KOUMOUL_REGISTRY_API_KEY` is set, otherwise reported as skipped.
6. Reads the exact running versions of each service (image labels or version endpoints), then tears down with `docker compose down -v` unless `--keep` is set.
7. Writes `test/reports/<date>-<recipe>.md` with the versions, image digests, step results and any skipped steps.
8. On full success, updates `validated-versions.json` for the services covered by that run, and the "Last validated" line in the README. The maintainer commits both.

Also, `npm run lint` (`scripts/lint.ts`):

- `docker compose config -q` on every recipe and overlay combination;
- a markdown link check (lychee via docker);
- eslint on the scripts.

## Drift detection and maintenance

### Weekly drift check (CI)

`.github/workflows/drift.yaml` runs weekly (cron) and on manual trigger. It runs `npm run lint` and `npm run check-versions`.

`scripts/check-versions.ts`:

- For every service in `validated-versions.json`, fetches the published tags (ghcr.io tags API; Docker Hub for mongo) and finds the latest version.
- For each data-fair service that moved, fetches its config schema at the validated tag and at the latest tag (raw files from GitHub, no clone). It reports env vars (from `custom-environment-variables`) and schema properties that were added, removed, or became required.
- Classifies each finding:
  - **action needed:** a new major, a removed or newly required variable, or a new major/minor of mongo or elasticsearch;
  - **info:** a new minor/patch that only adds optional variables.
- Prints a markdown report. With `--github-issue`, it keeps a single issue titled "Install docs drift" in sync through the GitHub API with the workflow's `GITHUB_TOKEN`:
  - creates or updates it when there are findings, action-needed first;
  - closes it when everything matches.

The check doesn't validate anything. It says when the docs may be stale and what changed, so the local procedure below can start.

### Local procedure (`MAINTENANCE.md`)

- Triggers: the drift issue, a user issue, or a new feature to document.
- For each flagged service:
  1. Read the drift report, the service changelog and, if needed, the full config schema diff.
  2. Update the compose files, `.env.example`, nginx config and prose.
  3. Add an entry to `docs/upgrading.md` when existing installs must act.
  4. Run `npm run lint`, then `npm run validate` for local, production, and production `--bonus`.
  5. Commit the changes, `validated-versions.json` and the "Last validated" line, with a summary of the report. The next weekly run closes the drift issue.
- Guidance for agents, in the same file:
  - Sources of truth are each service repo's config schema and dev compose, and the production infrastructure as a read-only reference. Never copy secrets or internal hostnames from the infrastructure.
  - Never update `validated-versions.json` by hand. If a doc change is committed without a successful validation run, say so explicitly in the commit message.

## Related work: retiring data-fair.github.io

Done separately (design approved in conversation): the `data-fair/data-fair.github.io` repo loses its `2/ 3/ 4/ master/` folders and gets:

- a bilingual home page linking to docs.koumoul.com, datafair.cloud and github.com/data-fair/install;
- a `404.html` that redirects old `/*/install/` URLs to this repo;
- an updated `robots.txt` and README.

The commit is ready locally. It will be pushed once this repo has content, so the link doesn't point to an empty README.

## Risks and open points

- Resources: the full production stack with the bonus overlay (ES 8 + mongo + ~15 containers) needs about 8–16 GB RAM on the validating machine. `validate.ts` checks the available memory.
- Wildcard TLS depends on the user's DNS provider having a certbot plugin; the documented fallback is to bring your own certificate.
- Some production env vars look stale (e.g. portals manager `ES_*`, metrics `DIRECTORY_URL`). The recipes only include variables confirmed in the current config schemas.
- Capture sandboxing: choose between the seccomp profile and `--no-sandbox` during implementation, based on what the current capture image supports; document the choice.
