# Sentry

This is an example showing how to use [Sentry](https://sentry.io) to catch & report errors on both client + server side.

- Sentry is initialized by the [experimental Plugins API](https://github.com/vercel/next.js/discussions/9133), which also captures unhandled exceptions
- `next.config.js` enables source maps and uploads them to Sentry in production
- The `now-build` step in `package.json` deletes the source maps from Vercel so they aren't publicly available

## Deploy your own

Once you have access to your [Sentry DSN](#step-1-enable-error-tracking), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/with-sentry&env=NEXT_PUBLIC_SENTRY_DSN&envDescription=DSN%20Key%20required%20by%20Sentry&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-sentry%23step-1-enable-error-tracking)

## How To Use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-sentry with-sentry
# or
yarn create next-app --example with-sentry with-sentry
```

## Configuration

### Step 1. Enable error tracking

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Next, Copy your Sentry DSN. You can get it from the settings of your project in **Client Keys (DSN)**. Then, copy the string labeled **DSN** and set it as the value for `NEXT_PUBLIC_SENTRY_DSN` inside `.env.local`

> **Note:** Error tracking is disabled when `NODE_ENV` is `development` due to the way Next.js handles errors in development. You'll want to test this sample using production builds (i.e. `next build`).

### Step 2. Run Next.js in production mode

```bash
npm install
npm run build
npm run start

# or

yarn install
yarn build
yarn start
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/zeit/next.js/discussions).

### Step 3. Automatic sourcemap upload (optional)

#### Using Vercel

You will either need to install and configure the [Sentry Vercel integration](https://docs.sentry.io/workflow/integrations/vercel) or supply the environment variables in `env.local.example` yourself. You'll also need to set the `VERCEL_URL` environment variable, which is used to only upload source maps from the Vercel build environment.

#### Without Using Vercel

1. Set up the `NEXT_PUBLIC_SENTRY_DSN` environment variable as described above.
2. Save your Sentry organization slug as the `SENTRY_ORG` environment variable and your project slug as the `SENTRY_PROJECT` environment variable in `.env.local`.
3. Set the `VERCEL_URL` environment variable to some value in `.env.local`.
4. Create an auth token in Sentry. The recommended way to do this is by creating a new internal integration for your organization. To do so, go into **Settings > Developer Settings > New internal integration**. After the integration is created, copy the Token.
5. Save the token inside the `SENTRY_AUTH_TOKEN` environment variable in `.env.local`.

> **Note:** Sourcemap upload is disabled in development mode using the `NODE_ENV` environment variable. To change this behavior, remove the `NODE_ENV === 'production'` check from your `next.config.js` file.

## Other configuration options

More configurations are available for the [Sentry webpack plugin](https://github.com/getsentry/sentry-webpack-plugin) using [Sentry Configuration variables](https://docs.sentry.io/cli/configuration/) for defining the releases/verbosity/etc.

## Notes

- By default, neither sourcemaps nor error tracking are enabled in development mode (see Configuration).
- When enabled in development mode, error handling [works differently than in production](https://nextjs.org/docs/advanced-features/custom-error-page#customizing-the-error-page).
- The build output will contain warning about unhandled Promise rejections. This is caused by the test pages, and is expected.
- The version of `@zeit/next-source-maps` (`0.0.4-canary.1`) is important and must be specified since it is not yet the default. Otherwise [source maps will not be generated for the server](https://github.com/zeit/next-plugins/issues/377).
- Both `@zeit/next-source-maps` and `@sentry/webpack-plugin` are added to dependencies (rather than `devDependencies`) because if used with SSR, these plugins are used during production for generating the source-maps and sending them to sentry.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/with-sentry&env=NEXT_PUBLIC_SENTRY_DSN&envDescription=DSN%20Key%20required%20by%20Sentry&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-sentry%23step-1-enable-error-tracking)
