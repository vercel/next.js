# Example app with imported and hashed statics

This example shows how to import images, videos, etc. from `/static` and get the URL with a hash query allowing to use better cache without problems.

This example supports `.svg`, `.png` and `.txt` extensions, but it can be configured to support any possible extension changing the `extensions` array in the `next.config.js` [file](https://github.com/zeit/next.js/blob/canary/examples/with-hashed-statics/next.config.js#L4).

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-hashed-statics)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-hashed-statics with-hashed-statics-app
# or
yarn create next-app --example with-hashed-statics with-hashed-statics-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-hashed-statics
cd with-hashed-statics
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
