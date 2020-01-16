# With universal runtime configuration

This example show how to set custom environment variables for your application at runtime using the `publicRuntimeConfig` key in `next.config.js`

For documentation see: https://github.com/zeit/next.js#exposing-configuration-to-the-server--client-side

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-universal-configuration-runtime with-universal-configuration-runtime-app
# or
yarn create next-app --example with-universal-configuration-runtime with-universal-configuration-runtime-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-universal-configuration-runtime
cd with-universal-configuration-runtime
```

Install it and run:

```bash
npm install
API_URL='https://example.com' npm run dev
# or
yarn
API_URL='https://example.com' yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
