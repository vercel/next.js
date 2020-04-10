# Magic Example

This example show how to use [Magic](https://magic.link) with Next.js. The example features cookie based, passwordless authentication with email-based magic links.

The example shows how to do a login and logout; and to get the user info using a hook with [SWR](https://swr.now.sh).

A DB is not included. You can use any db you want and add it [here](/lib/user.js).

The login cookie is httpOnly, meaning it can only be accessed by the API, and it's encrypted using [@hapi/iron](https://hapi.dev/family/iron) for more security.

## Configure Magic

Login to the [Magic Dashboard](https://dashboard.magic.link/) and add new application to get your keys. Don't forget to put keys in `.env` (look for `.env.template` for example) and upload them as secrets to [ZEIT Now](https://zeit.co/now).

```
now secrets add @magic-publishable-key pk_test_*********
```
```
now secrets add @magic-secret-key sk_test_*********
```

![Magic Dashboard](https://gblobscdn.gitbook.com/assets%2F-M1XNjqusnKyXZc7t7qQ%2F-M3HsSftOAghkNs-ttU3%2F-M3HsllfdwdDmeFXBK3U%2Fdashboard-pk.png?alt=media&token=4d6e7543-ae20-4355-951c-c6421b8f1b5f)

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/magic)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example magic magic-app
# or
yarn create next-app --example magic magic-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/magic
cd magic
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
