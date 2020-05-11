---
description: Learn to add and access environment variables in your Next.js application.
---

# Environment Variables

> This document is for Next.js versions 9.4 and up. If you’re using an older version of Next.js, refer to [Environment Variables in next.config.js](/docs/api-reference/next.config.js/environment-variables.md).

Next.js comes with built-in support for environment variables, which allows you to do the following:

- [Inline variables starting with `NEXT_PUBLIC_`](#inlined-environment-variables)
- [Use `.env` to add custom environment variables](#exposing-environment-variables)

## Inlined Environment Variables

Next.js will inline any environment variable that starts with `NEXT_PUBLIC_` using Webpack [DefinePlugin](https://webpack.js.org/plugins/define-plugin/). Inlining means replacing the variable with the value. For example, the following page:

```jsx
export default function Page() {
  return <h1>The public value is: {process.env.NEXT_PUBLIC_EXAMPLE_KEY}</h1>
}
```

Will end up being:

```jsx
export default function Page() {
  return <h1>The public value is: {'my-value'}</h1>
}
```

Next.js replaced `process.env.NEXT_PUBLIC_EXAMPLE_KEY` with its value, that in this case is `'my-value'`.

You can use the shell or any other tool that runs before the [Next.js CLI](/api-reference/cli) to add environment variables. For example, using the bash:

```bash
NEXT_PUBLIC_EXAMPLE_KEY=my-value next dev
```

And using [cross-env](https://github.com/kentcdodds/cross-env):

```bash
npx cross-env NEXT_PUBLIC_EXAMPLE_KEY=my-value next dev
```

### Caveats

- Trying to destructure `process.env` variables won't work due to the nature of webpack [DefinePlugin](https://webpack.js.org/plugins/define-plugin/).
- When dealing with secrets, it's better to [expose the variables using `.env`](#exposing-environment-variables), to avoid exposing secrets in your build output

## Exposing Environment Variables

Next.js allows you to expose variables using an environment variables file (`.env`), with included support for multiple environments. It works like this:

- `.env` - Contains environment variables for all environments
- `.env.local` - Local variable overrides for all environments
- `.env.[environment]` - Environment variables for one environment. For example: `.env.development`
- `.env.[environment].local` - Local variable overrides for one environment. For example: `.env.development.local`

> **Note**: `.env` files **should be** included in your repository, but **`.env*.local` files should be ignored**. Consider `.local` files as a good place for secrets, and non-local files as a good place for defaults.

The supported environments are `development`, `production` and `test`. The environment is selected in the following way:

- [`next dev`](/docs/api-reference/cli#development) uses `development`
- [`next build`](/docs/api-reference/cli#build) and [`next-start`](/docs/api-reference/cli#production) use `production`
- `NODE_ENV=test next dev` will use `test` instead of the default.

If the same environment variable is defined multiple times, the priority of which variable to use is decided in the following order:

- Already defined environment variables have the higher priority. For example: `MY_KEY=value next dev`
- `.env.[environment].local`
- `.env.[environment]`
- `.env.local`
- `.env`

For example, consider the file `.env.local` with the following content:

```bash
API_KEY='my-secret-api-key'
NEXT_PUBLIC_APP_LOCALE='en-us'
```

And the following page:

```jsx
export default function Page() {
  return <h1>The locale is set to: {process.env.NEXT_PUBLIC_APP_LOCALE}</h1>
}

export async function getStaticProps() {
  const db = await myDB(process.env.API_KEY)
  // ...
}
```

`process.env.NEXT_PUBLIC_APP_LOCALE` will be replaced with `'en-us'` in the build output. Because variables that start with `NEXT_PUBLIC_` will be [inlined at build time](#inlined-environment-variables).

`process.env.API_KEY` will be a variable with `'my-secret-api-key'` at build time and runtime, but the build output will not have access to the key.

Now, if you add a `.env` file like this one:

```bash
API_KEY='default-api-key'
CLIENT_KEY='default-client-key'
NEXT_PUBLIC_APP_LOCALE='en-us'
```

Both `API_KEY` and `NEXT_PUBLIC_APP_LOCALE` will be ignored as `.env.local` has a higher priority, but `CLIENT_KEY` will become available.
