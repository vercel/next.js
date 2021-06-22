---
description: Next.js provides an integrated ESLint experience by default. These conformance rules help you use Next.js in the optimal way.
---

# ESLint

Since version **11.0.0**, Next.js provides an integrated [ESLint](https://eslint.org/) experience out of the box. Add `next lint` as a script to `package.json`:

```json
"scripts": {
  "lint": "next lint"
}
```

Then run `npm run lint` or `yarn lint`:

```bash
yarn lint
```

If you don't already have ESLint configured in your application, you will be guided through the installation of the required packages.

```bash
yarn lint

# You'll see instructions like these:
#
# Please install eslint and eslint-config-next by running:
#
#         yarn add --dev eslint eslint-config-next
#
# ...
```

If no ESLint configuration is present, Next.js will create an `.eslintrc` file in the root of your project and automatically configure it with the base configuration:

```js
{
  "extends": "next"
}
```

You can now run `next lint` every time you want to run ESLint to catch errors.

> The default base configuration (`"extends": "next"`) can be updated at any time and will only be included if no ESLint configuration is present.

We recommend using an appropriate [integration](https://eslint.org/docs/user-guide/integrations#editors) to view warnings and errors directly in your code editor during development.

## Linting During Builds

Once ESLint has been set up, it will automatically run during every build (`next build`). Errors will fail the build, while warnings will not.

If you do not want ESLint to run as a build step, refer to the documentation for [Ignoring ESLint](/docs/api-reference/next.config.js/ignoring-eslint.md):

## Linting Custom Directories

By default, Next.js will run ESLint for all files in the `pages/`, `components/`, and `lib/` directories. However, you can specify which directories using the `dirs` option in the `eslint` config in `next.config.js` for production builds:

```js
module.exports = {
  eslint: {
    dirs: ['pages', 'utils'], // Only run ESLint on the 'pages' and 'utils' directories during production builds (next build)
  },
}
```

Similarly, the `--dir` flag can be used for `next lint`:

```bash
yarn lint --dir pages --dir utils
```

## ESLint Plugin

Next.js provides an ESLint plugin, [`eslint-plugin-next`](https://www.npmjs.com/package/@next/eslint-plugin-next), making it easier to catch common issues and problems in a Next.js application. The full set of rules is as follows:

|     | Rule                                                                                           | Description                                                      |
| :-: | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| ✔️  | [next/google-font-display](https://nextjs.org/docs/messages/google-font-display)               | Enforce optional or swap font-display behavior with Google Fonts |
| ✔️  | [next/google-font-preconnect](https://nextjs.org/docs/messages/google-font-preconnect)         | Enforce preconnect usage with Google Fonts                       |
| ✔️  | [next/link-passhref](https://nextjs.org/docs/messages/link-passhref)                           | Enforce passHref prop usage with custom Link components          |
| ✔️  | [next/no-css-tags](https://nextjs.org/docs/messages/no-css-tags)                               | Prevent manual stylesheet tags                                   |
| ✔️  | [next/no-document-import-in-page](https://nextjs.org/docs/messages/no-document-import-in-page) | Disallow importing next/document outside of pages/document.js    |
| ✔️  | [next/no-head-import-in-document](https://nextjs.org/docs/messages/no-head-import-in-document) | Disallow importing next/head in pages/document.js                |
| ✔️  | [next/no-html-link-for-pages](https://nextjs.org/docs/messages/no-html-link-for-pages)         | Prohibit HTML anchor links to pages without a Link component     |
| ✔️  | [next/no-img-element](https://nextjs.org/docs/messages/no-img-element)                         | Prohibit usage of HTML &lt;img&gt; element                       |
| ✔️  | [next/no-page-custom-font](https://nextjs.org/docs/messages/no-page-custom-font)               | Prevent page-only custom fonts                                   |
| ✔️  | [next/no-sync-scripts](https://nextjs.org/docs/messages/no-sync-scripts)                       | Forbid synchronous scripts                                       |
| ✔️  | [next/no-title-in-document-head](https://nextjs.org/docs/messages/no-title-in-document-head)   | Disallow using &lt;title&gt; with Head from next/document        |
| ✔️  | [next/no-unwanted-polyfillio](https://nextjs.org/docs/messages/no-unwanted-polyfillio)         | Prevent duplicate polyfills from Polyfill.io                     |

- ✔: Enabled in the recommended configuration

## Base Configuration

The Next.js base ESLint configuration is automatically generated when `next lint` is run for the first time:

```js
{
  "extends": "next"
}
```

This configuration extends recommended rule sets from various ESLint plugins:

- [`eslint-plugin-react`](https://www.npmjs.com/package/eslint-plugin-react)
- [`eslint-plugin-react-hooks`](https://www.npmjs.com/package/eslint-plugin-react-hooks)
- [`eslint-plugin-next`](https://www.npmjs.com/package/@next/eslint-plugin-next)

You can see the full details of the shareable configuration in the [`eslint-config-next`](https://www.npmjs.com/package/eslint-config-next) package.

## Disabling Rules

If you would like to modify or disable any rules provided by the supported plugins (`react`, `react-hooks`, `next`), you can directly change them using the `rules` property in your `.eslintrc`:

```js
{
  "extends": "next",
  "rules": {
    "react/no-unescaped-entities": "off",
    "@next/next/no-page-custom-font": "off",
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

A stricter `next/core-web-vitals` rule set can also be added in `.eslintrc`:

```
{
  "extends": ["next", "next/core-web-vitals"]
}
```

`next/core-web-vitals` updates `eslint-plugin-next` to error on a number of rules that are warnings by default if they affect [Core Web Vitals](https://web.dev/vitals/).

> Both `next` and `next/core-web-vitals` entry points are automatically included for new applications built with [Create Next App](/docs/api-reference/create-next-app.md).

## Usage with Prettier

ESLint also contains code formatting rules, which can conflict with your existing [Prettier](https://prettier.io/) setup. We recommend including [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier) in your ESLint config to make ESLint and Prettier work together.

```js
{
  "extends": ["next", "prettier"]
}
```

## Migrating Existing Config

If you already have ESLint configured in your application, we recommend extending directly from the Next.js ESLint plugin instead of the shareable configuration.

```js
module.exports = {
  extends: [
    //...
    'plugin:@next/next/recommended',
  ],
}
```

This eliminates any risk of collisions that can occur due to importing the same plugin or parser across multiple configurations.
