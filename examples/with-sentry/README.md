# Sentry

This is an example showing how to use [Sentry](https://sentry.io) to catch and report errors and monitor the performance of both the front and back ends, using the [official Sentry SDK for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/). This example contains the following:

- `sentry.server.config.js` and `sentry.client.config.js` are used to configure and initialize Sentry
- `next.config.js` automatically injects Sentry into your app using `withSentryConfig`
- `_error.js` (which is rendered by Next.js when handling certain types of exceptions) is overridden so those exceptions can be passed along to Sentry

## Deploy your own

It only takes a few steps to create and deploy your own version of this example app. Before you begin, make sure you have [linked your Vercel account to GitHub](https://vercel.com/docs/teams-and-accounts#existing-login-connection), and [set up a project in Sentry](https://docs.sentry.io/product/sentry-basics/guides/integrate-frontend/create-new-project/).

### Option 1: Deploy directly to Vercel

You can deploy a copy of this project directly to [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-sentry).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-sentry&project-name=nextjs-sentry-example&repository-name=nextjs-sentry-example&integration-ids=oac_5lUsiANun1DEzgLg0NZx5Es3)

This will clone this example to your GitHub org, create a linked project in Vercel, and prompt you to install the Vercel Sentry Integration. (You can read more about the integration [on Vercel](https://vercel.com/integrations/sentry) and in [the Sentry docs](https://docs.sentry.io/product/integrations/deployment/vercel/).)

### Option 2: Create locally before deploying

Alternatively, you can create a copy of this example app locally so you can configure and customize it before you deploy it.

#### Create and configure your app

To begin, execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npx](https://www.npmjs.com/package/npx) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), to create the app and install dependencies:

```bash
npx create-next-app --example with-sentry nextjs-sentry-example
```

```bash
yarn create next-app --example with-sentry nextjs-sentry-example
```

```bash
pnpm create next-app --example with-sentry nextjs-sentry-example
```

Next, run [`sentry-wizard`](https://docs.sentry.io/platforms/javascript/guides/nextjs/#configure), which will create and populate the settings files needed by `@sentry/nextjs` to initialize the SDK and upload source maps to Sentry:

```bash
npx @sentry/wizard -i nextjs
```

_Beware that above command creates files extended with `.wizardcopy.js` as the example already contains the config files. Thus after running the wizard, replace example files with those newly created._

Once the files are created, you can further configure your app by adding [SDK settings](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/) to `sentry.server.config.js` and `sentry.client.config.js`, and [`SentryWebpackPlugin` settings](https://github.com/getsentry/sentry-webpack-plugin#options) to `next.config.js`.

(If you'd rather do the SDK set-up manually, [you can do that, too](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/).)

You should now be able to build and run your app locally, upload source maps, and send errors and performance data to Sentry. For more details, check out the [Sentry Next.js SDK docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/).

#### Deploy your app to Vercel

Vercel reads you code from GitHub, so you first need to [create an empty GitHub repo](https://docs.github.com/en/get-started/quickstart/create-a-repo) for your project and then add it to your local repo [as a remote](https://docs.github.com/en/get-started/getting-started-with-git/about-remote-repositories):

```bash
git remote add origin https://github.com/<org>/<repo>.git
```

Next, [create a project in Vercel](https://vercel.com/docs/projects/overview#creating-a-project) and [link it to your GitHub repo](https://vercel.com/docs/git#deploying-a-git-repository).

In order for Vercel to upload source maps to Sentry when building your app, it needs a Sentry auth token. The wizard automatically sets up your personal token locally; to use that token on Vercel, add an [environment variable](https://vercel.com/docs/projects/environment-variables) to your Vercel project with the key `SENTRY_AUTH_TOKEN` and the value you'll find in `.sentryclirc` at the root level of your project. To use an org-wide token instead, set up the Vercel Sentry Integration. (You can read more about the integration [on Vercel](https://vercel.com/integrations/sentry) and in [the Sentry docs](https://docs.sentry.io/product/integrations/deployment/vercel/).)

Finally, commit your app and push it to GitHub:

```bash
git add .
git commit -m "Initial commit"
git push
```

This will trigger a deployment in Vercel. Head over to your [Vercel dashboard](https://vercel.com/dashboard), click on your project, and then click "Visit" to see the results!

_Note: The `@sentry/nextjs` SDK is only intended to be used with Next.js versions 10.0.8 and higher_
