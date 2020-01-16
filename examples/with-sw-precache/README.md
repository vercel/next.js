# sw-precache example

You'll often want your Service Worker to be registered at the root level to give it access to your whole application.

This example shows how this can be achieved alongside [sw-precache](https://github.com/GoogleChrome/sw-precache) (via [the webpack plugin](https://github.com/goldhand/sw-precache-webpack-plugin)).

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-sw-precache with-sw-precache-app
# or
yarn create next-app --example with-sw-precache with-sw-precache-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-sw-precache
cd with-sw-precache
```

Install it and run:

```bash
npm install
npm run build
npm start
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```
