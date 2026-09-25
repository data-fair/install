# Operations

Commands below are run in the recipe folder. With the [bonus services](bonus-services.md), pass both compose files or set `COMPOSE_FILE` in `.env`.

## Logs

```sh
docker compose ps
docker compose logs -f data-fair data-fair-worker
docker compose logs --since 1h simple-directory
```

nginx access logs are in the `nginx` container (`docker compose logs nginx`).

## Updates

The recipes use the major version tags of the data-fair images (e.g. `ghcr.io/data-fair/data-fair:6`). Pulling the images gets you the latest minor and patch versions, which are compatible:

```sh
docker compose pull
docker compose up -d
```

Services run their own migration scripts on startup when needed.

A new major version may require changes in the configuration. MongoDB and Elasticsearch versions are pinned more precisely and are upgraded by hand. Before changing a major version or a pinned version, read the [upgrading notes](upgrading.md) and the changelog of the service, and compare your files with the latest version of this repository.

## Data and backups

All data lives in named Docker volumes (`docker volume ls`). The volume names are prefixed by the compose project name, which is the name of the recipe folder by default:

| Volume | Content |
|---|---|
| `mongo-data` | the MongoDB databases of all the services: accounts, metadata of datasets, content of editable datasets, portals, metrics, etc. |
| `data-fair-data` | the files of the datasets and their attachments |
| `elasticsearch-data` | the indices of the datasets |
| `registry-data` (bonus) | the plugins |
| `nginx-letsencrypt` (production) | the certificates and the letsencrypt account |
| `nginx-cache` (production) | the reverse proxy cache, it can be lost |

A backup should contain at least MongoDB and the `data-fair-data` volume, taken at the same time. Also keep your `.env` file: without `CIPHER_PASSWORD`, encrypted data in the databases can't be read.

```sh
# MongoDB dump, all databases
docker compose exec -T mongo mongodump --archive --gzip > mongo-$(date +%F).archive.gz
# dataset files
docker run --rm -v <project>_data-fair-data:/data:ro -v "$PWD":/backup alpine tar czf /backup/data-fair-data-$(date +%F).tar.gz -C /data .
```

Elasticsearch indices can be rebuilt from MongoDB and the files: every dataset can be reindexed from its source (`POST /data-fair/api/v1/datasets/{id}/_reindex` as owner or super administrator). For large platforms this takes time, and a snapshot of the `elasticsearch-data` volume taken with the services stopped restores faster.

## Mails

simple-directory sends every mail of the platform, including the ones of events, through the SMTP server configured in `MAILS_TRANSPORT`. It is a [nodemailer transport configuration](https://nodemailer.com/smtp) in JSON, for example:

```sh
MAILS_TRANSPORT={"host":"smtp.example.com","port":587,"auth":{"user":"my-user","pass":"my-password"}}
```

Check it with the "renew password" link of the login page, and look at `docker compose logs simple-directory` if the mail doesn't arrive.

## Scaling

- The `data-fair-worker` service does the heavy work: file parsing, indexing, enrichment. You can run several of them with `docker compose up -d --scale data-fair-worker=2`.
- Elasticsearch memory is set by `ES_JAVA_OPTS` (1 GB by default in the recipes). Give it about half of the memory of its container for large volumes of data.
- Beyond a single server, the services are usually deployed with Kubernetes, which is out of scope of this repository.

## Troubleshooting

### A service is not healthy

`docker compose ps` shows the health of each service. Look at its logs with `docker compose logs <service>`. Most startup errors are a missing or invalid variable in `.env`.

### MongoDB does not start on a recent kernel

Recent MongoDB 8 images refuse to start on Linux kernels 6.19 to 7.0.13 with the message `Linux kernel versions 6.19 and newer has a known incompatibility with this version of MongoDB`, see [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912). Kernels 7.0.14 and later are fixed. Server distributions (Ubuntu 24.04 LTS, Debian 12 and 13) use older, unaffected kernels.

On an affected machine, the best fix is to upgrade the kernel. Otherwise, you can pin an older MongoDB 8.0 image that doesn't include the check (the validation of these recipes uses `mongo:8.0.17` on such kernels): set `image: mongo:8.0.17` in the `mongo` service. This is a workaround for development machines, not for production: the underlying incompatibility is still there.

### Screenshots, portals or thumbnails fail

Some services call the platform on its public URL (for example the portals manager, and the browser of capture). The recipes make them reach nginx directly, through a Docker network alias equal to `DOMAIN` and through the `--host-resolver-rules` option of capture. If you change the domain, change it in `.env` only: the rest follows.
