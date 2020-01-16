# Example app with strict CSP generating script hash

This example features how you can set up a strict CSP for your pages whitelisting next's inline bootstrap script by hash.
In contrast to the example `with-strict-csp` based on nonces, this way doesn't require running a server to generate fresh nonce values on every document request.
It defines the CSP by document `meta` tag.

Note: There are still valid cases for using a nonce in case you need to inline scripts or styles for which calculating a hash is not feasible.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-strict-csp-hash)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-strict-csp-hash with-strict-csp-hash-app
# or
yarn create next-app --example with-strict-csp-hash with-strict-csp-hash-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-strict-csp-hash
cd with-strict-csp-hash
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
