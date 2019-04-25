# Strict CSP example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-strict-csp with-strict-csp-app
# or
yarn create next-app --example with-strict-csp with-strict-csp-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-strict-csp
cd with-strict-csp
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

If you want to implement a CSP, the most effective way is to follow the [strict CSP](https://csp.withgoogle.com/docs/strict-csp.html) approach. For it to work, we need to generate a nonce on every request.

This example uses [Helmet](https://github.com/helmetjs/helmet) to configure the CSP and add the appropriate headers to all server responses. The nonce is generated with [uuid](https://github.com/kelektiv/node-uuid). Then we can pass the nonce to `<Head>` and `<NextScript>` in the custom `<Document>`.
