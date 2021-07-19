---
description: Learn to add and access environment variables in your Next.js application.
---

# Environment Variables

> This document is for Next.js versions 9.4 and up. If you’re using an older version of Next.js, upgrade or refer to [Environment Variables in next.config.js](/docs/api-reference/next.config.js/environment-variables.md).

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/environment-variables">Environment Variables</a></li>
  </ul>
</details>

Next.js comes with built-in support for environment variables, which allows you to do the following:

- [Use `.env.local` to load environment variables](#loading-environment-variables)
- [Expose environment variables to the browser by prefixing with `NEXT_PUBLIC_`](#exposing-environment-variables-to-the-browser)

## Loading Environment Variables

Next.js has built-in support for loading environment variables from `.env.local` into `process.env`.

An example `.env.local`:

```bash
DB_HOST=localhost
DB_USER=myuser
DB_PASS=mypassword
```

This loads `process.env.DB_HOST`, `process.env.DB_USER`, and `process.env.DB_PASS` into the Node.js environment automatically allowing you to use them in [Next.js data fetching methods](/docs/basic-features/data-fetching.md) and [API routes](/docs/api-routes/introduction.md).

For example, using [`getStaticProps`](/docs/basic-features/data-fetching.md#getstaticprops-static-generation):

```js
// pages/index.js
export async function getStaticProps() {
  const db = await myDB.connect({
    host: process.env.DB_HOST,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
  })
  // ...
}
```

> **Note**: In order to keep server-only secrets safe, Next.js replaces `process.env.*` with the correct values
> at build time. This means that `process.env` is not a standard JavaScript object, so you’re not able to
> use [object destructuring](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment).
> Environment variables must be referenced as e.g. `process.env.NEXT_PUBLIC_PUBLISHABLE_KEY`, _not_ `const { NEXT_PUBLIC_PUBLISHABLE_KEY } = process.env`.

> **Note**: Next.js will automatically expand variables (`$VAR`) inside of your `.env*` files.
> This allows you to reference other secrets, like so:
>
> ```bash
> # .env
> HOSTNAME=localhost
> PORT=8080
> HOST=http://$HOSTNAME:$PORT
> ```
>
> If you are trying to use a variable with a `$` in the actual value, it needs to be escaped like so: `\$`.
>
> For example:
>
> ```bash
> # .env
> A=abc
>
> # becomes "preabc"
> WRONG=pre$A
>
> # becomes "pre$A"
> CORRECT=pre\$A
> ```

## Exposing Environment Variables to the Browser

By default all environment variables loaded through `.env.local` are only available in the Node.js environment, meaning they won't be exposed to the browser.

In order to expose a variable to the browser you have to prefix the variable with `NEXT_PUBLIC_`. For example:

```bash
NEXT_PUBLIC_ANALYTICS_ID=abcdefghijk
```

This loads `process.env.NEXT_PUBLIC_ANALYTICS_ID` into the Node.js environment automatically, allowing you to use it anywhere in your code. The value will be inlined into JavaScript sent to the browser because of the `NEXT_PUBLIC_` prefix. This inlining occurs at build time, so your various `NEXT_PUBLIC_` envs need to be set when the project is built.

```js
// pages/index.js
import setupAnalyticsService from '../lib/my-analytics-service'

// NEXT_PUBLIC_ANALYTICS_ID can be used here as it's prefixed by NEXT_PUBLIC_
setupAnalyticsService(process.env.NEXT_PUBLIC_ANALYTICS_ID)

function HomePage() {
  return <h1>Hello World</h1>
}

export default HomePage
```

## Default Environment Variables

In general only one `.env.local` file is needed. However, sometimes you might want to add some defaults for the `development` (`next dev`) or `production` (`next start`) environment.

Next.js allows you to set defaults in `.env` (all environments), `.env.development` (development environment), and `.env.production` (production environment).

`.env.local` always overrides the defaults set.

> **Note**: `.env`, `.env.development`, and `.env.production` files should be included in your repository as they define defaults. **`.env.*.local` should be added to `.gitignore`**, as those files are intended to be ignored. `.env.local` is where secrets can be stored.

## Environment Variables on Vercel

When deploying your Next.js application to [Vercel](https://vercel.com), Environment Variables can be configured [in the Project Settings](https://vercel.com/docs/environment-variables).

All types of Environment Variables should be configured there. Even Environment Variables used in Development – which can be [downloaded onto your local device](https://vercel.com/docs/environment-variables#development-environment-variables) afterwards.

If you've configured [Development Environment Variables](https://vercel.com/docs/environment-variables#development-environment-variables) you can pull them into a `.env.local` for usage on your local machine using the following command:

```bash
vercel env pull .env.local
```

When using the Vercel CLI to deploy make sure you add a [`.vercelignore`](https://vercel.com/guides/prevent-uploading-sourcepaths-with-vercelignore?query=vercelignore#allowlist) that includes files that should not be uploaded, generally these are the same files included in `.gitignore`.

## Test Environment Variables

Apart from `development` and `production` environments, there is a 3rd option available: `test`. In the same way you can set defaults for development or production environments, you can do the same with `.env.test` file for testing environment (though this one is not so common as the previous two).

This one is useful when running tests with tools like `jest` or `cypress` where you need to set specific environment vars only for testing purposes. Test default values will be loaded if `NODE_ENV` is set to `test`, though you usually don't need to do this manually as testing tools will address it for you.

There is a small difference between `test` environment, and both `development` and `production` that you need to bear in mind: `.env.local` won't be loaded, as you expect tests to produce the same results for everyone. This way every test execution will use same env defaults across different executions by ignoring your `.env.local` (which is intended to override the default set).

> **Note**: similar to Default Environment Variables, `.env.test` file should be included in your repository, but `.env.test.local` shouldn't, as `.env*.local` are intended to be ignored through `.gitignore`.

While running unit tests you can make sure to load your environment variables the same way Next.js does by leveraging the `loadEnvConfig` function from the `@next/env` package.

```js
// The below can be used in a Jest global setup file or similar for your testing set-up
import { loadEnvConfig } from '@next/env'

export default async () => {
  const projectDir = process.cwd()
  loadEnvConfig(projectDir)
}
```
