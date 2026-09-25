# Upgrading

## From the former documentation (data-fair 4)

The former installation documentation (data-fair.github.io, 2020-2024) described recipes based on data-fair 4. Since then, the stack has changed a lot:

| Former recipes | Current recipes |
|---|---|
| data-fair 4 | data-fair 6 |
| simple-directory 7 | simple-directory 8, which requires `CIPHER_PASSWORD` |
| notify 3 | events 1 (notify is retired) |
| thumbor | removed, data-fair makes the thumbnails itself |
| portals 1 | portals 2 (manager + portal), served on subdomains |
| processings 1 | processings 6, plugins come from the registry service |
| metrics 0 (UDP logs) | metrics 2 (api + daemon, logs through a unix socket) |
| MongoDB 4.4 | MongoDB 8.0 |
| Elasticsearch 7.17 | Elasticsearch 8.19 |
| one nginx configuration file | nginx configuration split in includes, TLS in its own templates |

There is no automated migration path from the former recipes, and this repository hasn't validated one. Only move an existing platform with a complete backup (see [operations](operations.md#data-and-backups)), after trying the whole procedure on a copy.

The general approach:

1. **Back up** MongoDB, the data-fair volume and your `.env` file.
2. **Upgrade MongoDB step by step.** MongoDB only upgrades one major version at a time: 4.4 → 5.0 → 6.0 → 7.0 → 8.0. At each step, start the new version on the same volume, then set the feature compatibility version before the next step:

   ```sh
   docker compose exec mongo mongosh --eval 'db.adminCommand({ setFeatureCompatibilityVersion: "5.0" })'
   ```

   From 7.0, the command also requires `confirm: true`. See the [MongoDB upgrade procedures](https://www.mongodb.com/docs/manual/release-notes/8.0-upgrade-standalone/).
3. **Elasticsearch**: Elasticsearch 8 reads indices created by Elasticsearch 7, so you can start 8.19 on the 7.17 volume. Otherwise, start from an empty Elasticsearch and reindex every dataset from its source (see [operations](operations.md#data-and-backups)).
4. **Replace the recipe files** with the current ones, and carry over your values: `BASE_URL`, `SECRET`, `ADMINS`, mail transport. Add the new `CIPHER_PASSWORD`, and keep it forever.
5. **Start** and watch the logs. Each service runs its own upgrade scripts on startup.

Parts this repository can't describe precisely, check with the changelogs of the services:

- **notify → events**: subscriptions and notifications stored by notify are not known to be migrated to events.
- **portals 1 → 2**: portals 2 is a new application with its own storage; how portals made with version 1 are carried over is not covered here.
- **processings 1 → 6**: plugins are no longer installed from npm by the service itself but distributed by the registry (see [bonus services](bonus-services.md)).

## Later changes

Changes to the recipes that require an action on existing installations are listed here, most recent first.

_None yet._
