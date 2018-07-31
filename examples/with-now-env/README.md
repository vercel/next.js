[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-now-env)

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

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

keep in mind that in order to deploy the app to `now` the env [secrets](https://zeit.co/docs/getting-started/secrets) defined in `now.json` should be listed in your account

## The idea behind the example

This example shows the usage of [now-env](https://github.com/zeit/now-env), it allows to use secrets in development that will be replaced in production by the secrets defined with [now](https://zeit.co/docs/getting-started/secrets)
