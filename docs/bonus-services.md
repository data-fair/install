# Bonus services

Three optional services extend the production recipe:

- **registry**: stores plugins and distributes them to the other services.
- **processings**: runs periodic tasks based on plugins. For example, it can import data from an API every night, or harvest files.
- **catalogs**: synchronizes datasets with other data catalogs (import and publication), through plugins too.

Processings and catalogs are only as useful as the plugins available in your registry. **They work best with a [koumoul.com](https://koumoul.com) subscription**, which gives your registry access to the full registry of plugins maintained by Koumoul: your registry mirrors the plugins you select and keeps them up to date. Without a subscription, you can publish your own plugins in your registry.

## Enable them

1. Start the [production recipe](../recipes/production/) and log in as super administrator.
2. Create a super administrator API key for data-fair:
   1. Activate the admin mode (in the account menu, top right).
   2. In the parameters of your account, create an API key and check its admin mode option (only offered to super administrators in admin mode).
   3. Put it in `DATA_FAIR_API_KEY` in `.env`. The processings and catalogs workers use it to call the data-fair API (the catalogs worker refuses to start without it).
3. Start the bonus services with both compose files:

   ```sh
   docker compose -f compose.yaml -f compose.bonus.yaml up -d
   docker compose -f compose.yaml -f compose.bonus.yaml ps
   ```

   From now on, pass both files to every `docker compose` command. Alternatively, set `COMPOSE_FILE=compose.yaml:compose.bonus.yaml` in `.env` so that plain `docker compose` commands use both.

The nginx configuration of the production recipe already routes `/registry/`, `/processings/` and `/catalogs/`. These routes answer `502 Bad Gateway` while the bonus services are not started.

`compose.bonus.yaml` also connects the services with each other: it declares the private URLs and shared secrets in data-fair, and adds processings and catalogs to the identity webhooks of simple-directory.

## Mirror the Koumoul plugins registry

With a koumoul.com subscription, you get the URL of the Koumoul registry and a read API key. Then, as super administrator in admin mode:

1. Open the registry at `https://<domain>/registry/`.
2. Add a remote registry with the URL and the API key. The key is stored encrypted with your `CIPHER_PASSWORD`.
3. Browse the plugins available on the remote registry and select the ones you want.
4. The selected plugins are downloaded right away, and synchronized once a day. You can also trigger a synchronization manually.

Mirrored plugins are read-only in your registry. To manage one yourself, unselect it from the mirror.

The registry documentation has the details: [architecture](https://github.com/data-fair/registry/blob/main/docs/architecture.md) and [publishing plugins from CI](https://github.com/data-fair/registry/blob/main/docs/ci-integration.md).

## Publish your own plugins

Processings and catalogs plugins are npm packages. You can upload them to your registry from its interface, or from a CI pipeline as described in [CI integration](https://github.com/data-fair/registry/blob/main/docs/ci-integration.md). To write a processing plugin, start from [processing-hello-world](https://github.com/data-fair/processing-hello-world).

## Configuration reference

- [registry](https://github.com/data-fair/registry/blob/main/api/config/type/schema.json)
- [processings](https://github.com/data-fair/processings/blob/master/api/config/type/schema.json) and [its worker](https://github.com/data-fair/processings/blob/master/worker/config/custom-environment-variables.mjs)
- [catalogs](https://github.com/data-fair/catalogs/blob/master/api/config/type/schema.json) and [its worker](https://github.com/data-fair/catalogs/blob/master/worker/config/custom-environment-variables.mjs)
