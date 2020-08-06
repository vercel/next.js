# Magic Example

This example show how to use [Magic](https://magic.link) with Next.js. The example features cookie-based, passwordless authentication with email-based magic links.

The example shows how to do a login and logout; and to get the user info using a hook with [SWR](https://swr.now.sh).

A DB is not included. But you can add any DB you like!.

The login cookie is `httpOnly`, meaning it can only be accessed by the API, and it's encrypted using [@hapi/iron](https://hapi.dev/family/iron) for more security.

## Deploy your own

Deploy the example using [Vercel Now](https://vercel.com/docs/now-cli#commands/overview/basic-usage):

[![Deploy with Vercel Now](https://vercel.com/button)](https://vercel.com/new/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-magic)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-magic with-magic-app
# or
yarn create next-app --example with-magic with-magic-app
```

## Configuration

Login to the [Magic Dashboard](https://dashboard.magic.link/) and get the keys of your application

![Magic Dashboard](https://gblobscdn.gitbook.com/assets%2F-M1XNjqusnKyXZc7t7qQ%2F-M3HsSftOAghkNs-ttU3%2F-M3HsllfdwdDmeFXBK3U%2Fdashboard-pk.png?alt=media&token=4d6e7543-ae20-4355-951c-c6421b8f1b5f)

Next, copy the `.env.local.example` file in this directory to .env.local (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY` should look like `pk_test_abc` or `pk_live_ABC`
- `MAGIC_SECRET_KEY` should look like `sk_test_ABC` or `sk_live_ABC`

To deploy on Vercel, you need to set up the environment variables with the [Environment Variables UI](https://vercel.com/blog/environment-variables-ui) using the [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/cli#commands/env)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI, link your project and run the following command to add the `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY` and `MAGIC_SECRET_KEY` environment variables.

```bash
vercel env add
```
