---
description: Next.js supports ESLint by default. You can get started with ESLint in Next.js here.
---

# ESLint

Since version **11.0.0**, Next.js provides an integrated [ESLint](https://eslint.org/) experience out of the box. To get started, run `next lint`:

```bash
next lint
```

If you don't already have ESLint configured in your application, you will be guided through the installation of any required packages.

```bash
next lint

# You'll see instructions like these:
#
# Please install eslint and eslint-config-next by running:
#
#         yarn add --dev eslint eslint-config-next
#
# ...
```

If no ESLint configuration is present, Next.js will create an `.eslintrc` file in the root of your project and automatically configure it with the base configuration:

```
{
  "extends": "next"
}
```

Now you can run `next lint` every time you want to run ESLint to catch errors

> The default base configuration (`"extends": "next"`) can be updated at any time and will only be included if no ESLint configuration is present.

We recommend using an appropriate [integration](https://eslint.org/docs/user-guide/integrations#editors) to view warnings and errors directly in your code editor during development.

## Linting During Builds

Once ESLint has been set up, it will automatically run during every build (`next build`). Errors will fail the build while warnings will not.

If you do not want ESLint to run as a build step, it can be disabled using the `--no-lint` flag:

```bash
next build --no-lint
```

This is not recommended unless you have configured ESLint to run in a separate part of your workflow (for example, in CI or a pre-commit hook).

## Linting Custom Directories

By default, Next.js will only run ESLint for all files in the `pages/` directory. However, you can specify other custom directories to run by using the `--dir` flag in `next lint`:

```bash
next lint --dir components --dir lib
```

## ESLint Plugin

Next.js provides an ESLint plugin, [`eslint-plugin-next`](https://www.npmjs.com/package/@next/eslint-plugin-next), that makes it easier to catch common issues and problems in a Next.js application. The full set of rules can be found in the [package repository](https://github.com/vercel/next.js/tree/master/packages/eslint-plugin-next/lib/rules).

## Base Configuration

The Next.js base ESLint configuration is automatically generated when `next lint` is run for the first time:

```
{
  "extends": "next"
}
```

This configuration extends recommended rule sets from various Eslint plugins:

- [`eslint-plugin-react`](https://www.npmjs.com/package/eslint-plugin-react)
- [`eslint-plugin-react-hooks`](https://www.npmjs.com/package/eslint-plugin-react-hooks)
- [`eslint-plugin-next`](https://www.npmjs.com/package/@next/eslint-plugin-next)

You can see the full details of the shareable configuration in the [`eslint-config-next`](https://www.npmjs.com/package/eslint-config-next) package.

If you would like to modify any rules provided by the supported plugins (`react`, `react-hooks`, `next`), you can directly modify them using the `rules` property:

```
{
  "extends": "next",
  "rules": {
    "react/no-unescaped-entities": "off",
    "@next/next/no-page-custom-font": "error",
  }
}
```

> **Note**: If you need to also include a separate, custom ESLint configuration, it is highly recommended that `eslint-config-next` is extended last after other configurations. For example:
>
> ```
> {
>   "extends": ["eslint:recommended", "next"]
> }
> ```
>
> The `next` configuration already handles setting default values for the `parser`, `plugins` and `settings` properties.
> There is no need to manually re-declare any of these properties unless you need a different configuration for your use case.
> If you include any other shareable configurations, you will need to make sure that these properties are not overwritten or modified.

### Core Web Vitals

A stricter `next/core-web-vitals` entrypoint can also be specified in `.eslintrc`:

```
{
  "extends": ["next", "next/core-web-vitals"]
}
```

`next/core-web-vitals` updates `eslint-plugin-next` to error on a number of rules that are warnings by default if they affect [Core Web Vitals](https://web.dev/vitals/).

> Both `next` and `next/core-web-vitals` entry points are automatically included for new applications built with [Create Next App](/docs/api-reference/create-next-app.md).
