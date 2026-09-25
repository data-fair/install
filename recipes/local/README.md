# Local recipe

Runs Data Fair and its main services on your computer, to try the platform or to develop extensions. Do not expose it to the internet: it uses plain HTTP and a mailbox that anyone can read.

Services: nginx, data-fair (server and worker), simple-directory, events, openapi-viewer, capture, portals (manager and portal), MongoDB, Elasticsearch and [maildev](https://github.com/maildev/maildev), which catches every mail sent by the platform.

## Start

1. Get this folder, for example with git:

   ```sh
   git clone https://github.com/data-fair/install.git
   cd install/recipes/local
   ```

2. Create your `.env` file and replace the `CHANGE_ME` values with random strings:

   ```sh
   cp .env.example .env
   sed -i "s/^SECRET=CHANGE_ME/SECRET=$(openssl rand -hex 32)/; s/^CIPHER_PASSWORD=CHANGE_ME/CIPHER_PASSWORD=$(openssl rand -hex 32)/" .env
   ```

   You can also put your own email in `ADMINS` to become the super administrator.

3. Start the services:

   ```sh
   docker compose up -d
   ```

4. Wait until every service is `healthy`. The first start downloads the images and can take a few minutes.

   ```sh
   docker compose ps
   ```

5. Open [http://datafair.localhost](http://datafair.localhost). Browsers resolve every `*.localhost` name to your computer, so no DNS setup is needed.

## First login

The super administrators listed in `ADMINS` exist from the start, without a password:

1. On the login page, enter the admin email (`admin@example.com` by default) and choose to renew the password.
2. Open the mailbox at [http://datafair.localhost/mails/](http://datafair.localhost/mails/) and follow the link in the mail.
3. Set a password and log in.

## Portals

Create a portal from the portals menu. Each portal is served on its own host name, `http://<portal id>.portal.datafair.localhost`, and opens directly in your browser.

## Stop, reset

```sh
# stop the services, keep the data
docker compose down
# stop the services and delete all the data
docker compose down -v
```

## Troubleshooting

- Look at the logs of a service: `docker compose logs -f data-fair`.
- `datafair.localhost` doesn't open: some tools other than browsers do not resolve `*.localhost`. Add a line `127.0.0.1 datafair.localhost` to `/etc/hosts`.
- Port 80 is already used: free it before starting. The recipe expects the public port and the port nginx listens on inside the Docker network to be the same, because the services call the platform's public URL through nginx.
- Do not replace `datafair.localhost` with plain `localhost`: inside a container `localhost` is the container itself, and the services need to reach the platform's public URL through nginx.
- More in [operations](../../docs/operations.md#troubleshooting).
