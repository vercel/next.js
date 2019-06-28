# Now-env example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example with-now-env with-now-env-app
# or
yarn create next-app --example with-now-env with-now-env-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-now-env
cd with-now-env
```

Install it with `npm` or `yarn`:

```bash
npm install
# or
yarn
```

Start the development server with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now dev
```

Deploy it to the cloud with `now`:

```bash
now
```

keep in mind that in order to deploy the app to `now` the env [secrets](https://zeit.co/docs/getting-started/secrets) defined in `now.json` should be listed in your account.

## The idea behind the example

This example shows the usage of [Now Secrets](https://zeit.co/docs/v2/deployments/environment-variables-and-secrets/?query=secret#securing-environment-variables-using-secrets) and [now dev](https://zeit.co/docs/v2/development/basics), it shows how to add environment variables in development that can be replaced in production by the secrets defined with [Now](https://zeit.co/now).
