# Nginx example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example server-nginx server-nginx-app
# or
yarn create next-app --example server-nginx server-nginx-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/server-nginx
cd server-nginx
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

create docker image and run it:

```bash
docker build -t nextjs .
docker run -p 3000:80 nextjs
```

## The idea behind the example

Documentation recommends having a proxy in front of next to handle compression in a more efficient way.
This example creates a docker image with nginx and the app running inside it.
If you don't want the docker image you can check the nginx configuration in `.docker/nginx`.
