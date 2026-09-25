# Maintenance

The recipes are only useful if they work with the current versions of the services. This page describes how they are validated and kept up to date, by a maintainer or by an agent.

## Tools

Requirements: Node.js 24, Docker with Compose ≥ 2.24, about 16 GB of memory for the production validation with the bonus services, and free ports 80, 18080 and 18443.

```sh
npm ci
npm run test-unit                          # unit tests of the scripts
npm run lint                               # compose config of every recipe, markdown links, eslint, tsc
npm run validate -- local                  # full validation of a recipe, see below
npm run validate -- production
npm run validate -- production --bonus
npm run check-versions                     # drift between validated and published versions
npm run check-tls                          # https setup of the production recipe, also part of validate
```

### What `validate` does

1. It copies the recipe to a temporary directory and creates `.env` from `.env.example` with random secrets, as the recipe README tells users to.
2. For production, it adds `test/production.override.yaml`: plain HTTP on `datafair.localhost`, maildev in place of SMTP, no certificates. The nginx includes, the metrics wiring and the service configuration stay as shipped.
3. On Linux kernels affected by [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912), it pins `mongo:8.0.17` and says so in the report.
4. It runs `docker compose up -d` and waits for every container to be healthy.
5. It runs the Playwright smoke tests of `test/smoke/`:
   - the superadmin logs in through the password reset mail;
   - a CSV is uploaded, indexed and queried;
   - the API documentation is served, and capture renders a screenshot;
   - a portal is created and served on its subdomain;
   - production: the metrics collected from nginx logs;
   - bonus: the registry, processings and catalogs.
6. For production, it starts the real nginx-certbot image with a local CA (`test/production.tls.override.yaml`) and checks the certificates and the HTTPS redirect.
7. It tears everything down (`--keep` leaves the stack running) and writes a report in `test/reports/`.
8. Only if everything passed, it updates `validated-versions.json` and the "Last validated" section of the README.

Known limits of the validation:
- the real letsencrypt issuance, and the DNS challenge for the portals wildcard, can't be tested locally;
- the processings and catalogs workers run with a placeholder `DATA_FAIR_API_KEY`;
- mirroring the Koumoul registry is only tested when `KOUMOUL_REGISTRY_URL` and `KOUMOUL_REGISTRY_API_KEY` are set in the environment.

## Weekly drift check

The [drift workflow](.github/workflows/drift.yaml) runs every Monday and on demand. It runs `npm run lint` and `npm run check-versions -- --github-issue`:

- It compares each service of `validated-versions.json` with the latest version published on ghcr.io or Docker Hub.
- For each data-fair service that moved, it compares its configuration files between the two versions (the env variables of `custom-environment-variables.*` and the required properties of `config/type/schema.json`), using the paths listed in `scripts/lib/services.ts`.
- It sorts the differences:
  - **Action needed**: a new major version; a new minor version of a pinned image (MongoDB, Elasticsearch, registry); a removed or newly required variable; a configuration file that moved; a service never validated.
  - **For information**: new optional variables, patch versions.
- It keeps a single issue with the `install-drift` label up to date with the report, and closes it when everything is in sync.

The `install-drift` label is created with the first issue. If the workflow fails to create the issue, create the label by hand once.

The check doesn't validate anything. It tells you when the docs may be stale and what changed.

## Procedure

Triggers: the drift issue, a user issue, or a new feature to document.

1. Read the drift report. For each flagged service, read its changelog and, if needed, the full diff of its configuration between the two versions.
2. Update the recipes: compose files, `.env.example`, nginx configuration. Then update the prose: recipe READMEs and `docs/`.
3. If existing installations must act (new required variable, removed service, new major version of a database), add an entry to [upgrading](docs/upgrading.md#later-changes).
4. Run `npm run lint`, then `npm run validate` for `local`, `production` and `production --bonus`.
5. Commit the changes with `validated-versions.json` and the README. The next weekly run closes the drift issue.

To add a service:
1. Add it to `scripts/lib/services.ts` (image, repository, configuration files, recipes).
2. Add it to the recipes with a healthcheck, and a route in the nginx configuration if it has a public API.
3. Add a smoke test and document it.

MongoDB major versions are followed by hand: `check-versions` only looks for new minor versions within the current major.

## Guidance for agents

- Sources of truth, in this order:
  1. the configuration of each service in its repository (`custom-environment-variables.*`, `config/type/schema.json`, `config/default.*`);
  2. the development `docker-compose.yml` of each service repository;
  3. a production deployment of the stack, as a read-only reference.
- Never copy secrets, internal host names or customer data from a production deployment into this repository.
- Never edit `validated-versions.json` or the "Last validated" section by hand: only a successful `npm run validate` writes them.
- If a change can't be validated (missing resources, a service down), say so explicitly in the commit message, and leave `validated-versions.json` as it is.
- When a smoke test fails, fix the recipe or the test's wrong assumption about the service (check the service's routes in its repository), never weaken the test to make it pass.
