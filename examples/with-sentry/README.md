# Sentry

This is an example showing how to use [Sentry](https://sentry.io) to catch & report errors on both client + server side, using the [official Sentry SDK for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/).

- `_app.js` renders on both the server and client
- `_error.js` is rendered by Next.js while handling certain types of exceptions for you. It is overridden so those exceptions can be passed along to Sentry
- Each API route is handled with `withSentry`
- `next.config.js` automatically configures the app to use Sentry through `withSentry`

## Deploy your own

Once you have access to your [Sentry DSN](https://docs.sentry.io/product/sentry-basics/dsn-explainer/#where-to-find-your-dsn), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-sentry&project-name=with-sentry&repository-name=with-sentry&env=NEXT_PUBLIC_SENTRY_DSN&envDescription=DSN%20Key%20required%20by%20Sentry&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-sentry%23step-1-enable-error-tracking)

Check out [Sentry’s Vercel Integration](#sentry-integration).

## How To Use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-sentry with-sentry-app
# or
yarn create next-app --example with-sentry with-sentry-app
```

## Configuration

You can [configure your app automatically](https://docs.sentry.io/platforms/javascript/guides/nextjs/#configure) or do the [manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/).
Both ways lead to having your custom config files (`next.config.js`, `sentry.client.config.js`, `sentry.server.config.js`, and `sentry.properties`); so you can delete them from the example, they are here to illustrate how an example app looks like.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-sentry&project-name=with-sentry&repository-name=with-sentry&env=NEXT_PUBLIC_SENTRY_DSN&envDescription=DSN%20Key%20required%20by%20Sentry&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-sentry%23step-1-enable-error-tracking)

## Sentry Integration

Sentry’s Vercel Integration connects your Sentry and Vercel projects to automatically upload source maps and notify Sentry of release deployment. Learn more about this integration in [Sentry’s full documentation](https://docs.sentry.io/product/integrations/vercel/).
