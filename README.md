# Data Fair installation

Self-hosting recipes for the [Data Fair](https://github.com/data-fair/data-fair) stack, based on Docker Compose.

- To learn what Data Fair is and how its services fit together, see [datafair.cloud](https://datafair.cloud).
- For user guides and tutorials, see [docs.koumoul.com](https://docs.koumoul.com).

This repository only covers installing and operating the platform yourself.

## Choose a recipe

| Recipe | For | What you get |
|---|---|---|
| [local](recipes/local/) | trying Data Fair on your computer | `http://datafair.localhost`, mails caught by a local mailbox, portals on `*.portal.datafair.localhost` |
| [production](recipes/production/) | a server exposed to the internet | your domain over HTTPS (letsencrypt), real SMTP, reverse proxy cache, portals on `*.portal.<domain>`, usage metrics |
| [production + bonus](docs/bonus-services.md) | adding periodic processings and catalog connectors | a plugins registry, processings and catalogs, which work best with a [koumoul.com](https://koumoul.com) subscription |

Every recipe is a folder with a `compose.yaml` file, an `.env.example` file and an nginx configuration, and it is validated by running it (see [Last validated](#last-validated)).

## Requirements

- Linux with [Docker Engine](https://docs.docker.com/engine/install/) and the Docker Compose plugin, version 2.24 or later (`docker compose version`).
- Hardware:
  - local: 4 CPU cores, 8 GB of memory, 20 GB of disk;
  - production: 4 CPU cores or more, 16 GB of memory, 100 GB of SSD storage, more with the bonus services and depending on your data volumes.
- Linux kernel: MongoDB 8 does not start on kernels 6.19 to 7.0.13 (see [troubleshooting](docs/operations.md#mongodb-does-not-start-on-a-recent-kernel)). Server distributions (Ubuntu 24.04 LTS, Debian 12 and 13) are not affected.

## Services

| Service | Role | Configuration reference |
|---|---|---|
| data-fair | the core: datasets, APIs, applications (server and worker) | [config schema](https://github.com/data-fair/data-fair/blob/master/api/config/type/schema.json) |
| simple-directory | accounts, organizations and authentication | [config schema](https://github.com/data-fair/simple-directory/blob/master/api/config/type/schema.json) |
| events | notifications and webhooks | [config schema](https://github.com/data-fair/events/blob/main/api/config/type/schema.json) |
| openapi-viewer | interactive API documentation | [config schema](https://github.com/data-fair/openapi-viewer/blob/master/api/config/type/schema.json) |
| capture | screenshots and thumbnails of visualizations | [config schema](https://github.com/data-fair/capture/blob/master/config/type/schema.json) |
| portals (manager and portal) | public or private data portals | [config schema](https://github.com/data-fair/portals/blob/master/api/config/type/schema.json) |
| metrics (api and daemon), production only | usage metrics computed from the reverse proxy logs | [config schema](https://github.com/data-fair/metrics/blob/master/api/config/type/schema.json) |
| registry, processings, catalogs (bonus) | plugins registry, periodic processings, catalog connectors | see [bonus services](docs/bonus-services.md) |
| MongoDB 8 and Elasticsearch 8 | databases | Elasticsearch uses the [data-fair image](https://github.com/data-fair/elasticsearch) that includes the ingest-attachment plugin |

In the configuration schemas, each property can be set with the environment variable listed in the `custom-environment-variables` file next to the schema.

## Last validated

<!-- last-validated -->
Last validated on 2026-09-25: local (2026-09-25), production (2026-09-25), production+bonus (2026-09-25).

| Service | Version |
|---|---|
| capture | 3.4.0 |
| catalogs | 1.2.2 |
| data-fair | 6.20.0 |
| elasticsearch | 8.19.9 |
| events | 1.4.1 |
| metrics | 2.5.0 |
| mongo | 8.0.17 |
| openapi-viewer | 2.3.1 |
| portals | 2.33.1 |
| processings | 6.3.0 |
| registry | 0.6.1 |
| simple-directory | 8.21.0 |
<!-- /last-validated -->

## More documentation

- [Operations](docs/operations.md): logs, updates, backups, troubleshooting
- [Portals](docs/portals.md): DNS, wildcard certificate, custom domains
- [Bonus services](docs/bonus-services.md): plugins registry, processings, catalogs
- [Upgrading](docs/upgrading.md): coming from the former documentation (data-fair 4, notify, thumbor, etc.)
- [Maintenance](MAINTENANCE.md): how these recipes are validated and kept up to date
