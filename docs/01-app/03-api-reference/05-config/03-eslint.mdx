---
title: ESLint Plugin
nav_title: ESLint
description: Learn how to use and configure the ESLint plugin to catch common issues and problems in a Next.js application.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

Next.js provides an ESLint configuration package, [`eslint-config-next`](https://www.npmjs.com/package/eslint-config-next), that makes it easy to catch common issues in your application. It includes the [`@next/eslint-plugin-next`](https://www.npmjs.com/package/@next/eslint-plugin-next) plugin along with recommended rule-sets from [`eslint-plugin-react`](https://www.npmjs.com/package/eslint-plugin-react) and [`eslint-plugin-react-hooks`](https://www.npmjs.com/package/eslint-plugin-react-hooks).

The package provides two main configurations:

- **`eslint-config-next`**: Base configuration with Next.js, React, and React Hooks rules. Supports both JavaScript and TypeScript files.
- **`eslint-config-next/core-web-vitals`**: Includes everything from the base config, plus upgrades rules that impact [Core Web Vitals](https://web.dev/vitals/) from warnings to errors. Recommended for most projects.

Additionally, for TypeScript projects:

- **`eslint-config-next/typescript`**: Adds TypeScript-specific linting rules from [`typescript-eslint`](https://typescript-eslint.io/). Use this alongside the base or core-web-vitals config.

## Setup ESLint

Get linting working quickly with the ESLint CLI (flat config):

1. Install ESLint and the Next.js config:

   ```bash package="pnpm"
   pnpm add -D eslint eslint-config-next
   ```

   ```bash package="npm"
   npm i -D eslint eslint-config-next
   ```

   ```bash package="yarn"
   yarn add --dev eslint eslint-config-next
   ```

   ```bash package="bun"
   bun add -d eslint eslint-config-next
   ```

2. Create `eslint.config.mjs` with the Next.js config:

   ```js filename="eslint.config.mjs"
   import { defineConfig, globalIgnores } from 'eslint/config'
   import nextVitals from 'eslint-config-next/core-web-vitals'

   const eslintConfig = defineConfig([
     ...nextVitals,
     // Override default ignores of eslint-config-next.
     globalIgnores([
       // Default ignores of eslint-config-next:
       '.next/**',
       'out/**',
       'build/**',
       'next-env.d.ts',
     ]),
   ])

   export default eslintConfig
   ```

3. Run ESLint:

   ```bash package="pnpm"
   pnpm exec eslint .
   ```

   ```bash package="npm"
   npx eslint .
   ```

   ```bash package="yarn"
   yarn eslint .
   ```

   ```bash package="bun"
   bunx eslint .
   ```

## Reference

The `eslint-config-next` package includes the `recommended` rule-sets from the following ESLint plugins:

- [`eslint-plugin-react`](https://www.npmjs.com/package/eslint-plugin-react)
- [`eslint-plugin-react-hooks`](https://www.npmjs.com/package/eslint-plugin-react-hooks)
- [`@next/eslint-plugin-next`](https://www.npmjs.com/package/@next/eslint-plugin-next)

### Rules

The `@next/eslint-plugin-next` rules included are:

| Enabled in recommended config | Rule                                                                                                                     | Description                                                                                                      |
| :---------------------------: | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
|      <Check size={18} />      | [@next/next/google-font-display](/docs/messages/google-font-display)                                                     | Enforce font-display behavior with Google Fonts.                                                                 |
|      <Check size={18} />      | [@next/next/google-font-preconnect](/docs/messages/google-font-preconnect)                                               | Ensure `preconnect` is used with Google Fonts.                                                                   |
|      <Check size={18} />      | [@next/next/inline-script-id](/docs/messages/inline-script-id)                                                           | Enforce `id` attribute on `next/script` components with inline content.                                          |
|      <Check size={18} />      | [@next/next/next-script-for-ga](/docs/messages/next-script-for-ga)                                                       | Prefer `next/script` component when using the inline script for Google Analytics.                                |
|      <Check size={18} />      | [@next/next/no-assign-module-variable](/docs/messages/no-assign-module-variable)                                         | Prevent assignment to the `module` variable.                                                                     |
|      <Check size={18} />      | [@next/next/no-async-client-component](/docs/messages/no-async-client-component)                                         | Prevent Client Components from being async functions.                                                            |
|      <Check size={18} />      | [@next/next/no-before-interactive-script-outside-document](/docs/messages/no-before-interactive-script-outside-document) | Prevent usage of `next/script`'s `beforeInteractive` strategy outside of `pages/_document.js`.                   |
|      <Check size={18} />      | [@next/next/no-css-tags](/docs/messages/no-css-tags)                                                                     | Prevent manual stylesheet tags.                                                                                  |
|      <Check size={18} />      | [@next/next/no-document-import-in-page](/docs/messages/no-document-import-in-page)                                       | Prevent importing `next/document` outside of `pages/_document.js`.                                               |
|      <Check size={18} />      | [@next/next/no-duplicate-head](/docs/messages/no-duplicate-head)                                                         | Prevent duplicate usage of `<Head>` in `pages/_document.js`.                                                     |
|      <Check size={18} />      | [@next/next/no-head-element](/docs/messages/no-head-element)                                                             | Prevent usage of `<head>` element.                                                                               |
|      <Check size={18} />      | [@next/next/no-head-import-in-document](/docs/messages/no-head-import-in-document)                                       | Prevent usage of `next/head` in `pages/_document.js`.                                                            |
|      <Check size={18} />      | [@next/next/no-html-link-for-pages](/docs/messages/no-html-link-for-pages)                                               | Prevent usage of `<a>` elements to navigate to internal Next.js pages.                                           |
|      <Check size={18} />      | [@next/next/no-img-element](/docs/messages/no-img-element)                                                               | Prevent usage of `<img>` element due to slower LCP and higher bandwidth.                                         |
|      <Check size={18} />      | [@next/next/no-page-custom-font](/docs/messages/no-page-custom-font)                                                     | Prevent page-only custom fonts.                                                                                  |
|      <Check size={18} />      | [@next/next/no-script-component-in-head](/docs/messages/no-script-component-in-head)                                     | Prevent usage of `next/script` in `next/head` component.                                                         |
|      <Check size={18} />      | [@next/next/no-styled-jsx-in-document](/docs/messages/no-styled-jsx-in-document)                                         | Prevent usage of `styled-jsx` in `pages/_document.js`.                                                           |
|      <Check size={18} />      | [@next/next/no-sync-scripts](/docs/messages/no-sync-scripts)                                                             | Prevent synchronous scripts.                                                                                     |
|      <Check size={18} />      | [@next/next/no-title-in-document-head](/docs/messages/no-title-in-document-head)                                         | Prevent usage of `<title>` with `Head` component from `next/document`.                                           |
|      <Check size={18} />      | @next/next/no-typos                                                                                                      | Prevent common typos in [Next.js's data fetching functions](/docs/pages/building-your-application/data-fetching) |
|      <Check size={18} />      | [@next/next/no-unwanted-polyfillio](/docs/messages/no-unwanted-polyfillio)                                               | Prevent duplicate polyfills from Polyfill.io.                                                                    |

We recommend using an appropriate [integration](https://eslint.org/docs/user-guide/integrations#editors) to view warnings and errors directly in your code editor during development.

<details>
  <summary>`next lint` removal</summary>

Starting with Next.js 16, `next lint` is removed.

As part of the removal, the `eslint` option in your Next config file is no longer needed and can be safely removed.

</details>

## Examples

### Specifying a root directory within a monorepo

If you're using `@next/eslint-plugin-next` in a project where Next.js isn't installed in your root directory (such as a monorepo), you can tell `@next/eslint-plugin-next` where to find your Next.js application using the `settings` property in your `eslint.config.mjs`:

```js filename="eslint.config.mjs"
import { defineConfig } from 'eslint/config'
import eslintNextPlugin from '@next/eslint-plugin-next'

const eslintConfig = defineConfig([
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      next: eslintNextPlugin,
    },
    settings: {
      next: {
        rootDir: 'packages/my-app/',
      },
    },
  },
])

export default eslintConfig
```

`rootDir` can be a path (relative or absolute), a glob (i.e. `"packages/*/"`), or an array of paths and/or globs.

### Disabling rules

If you would like to modify or disable any rules provided by the supported plugins (`react`, `react-hooks`, `next`), you can directly change them using the `rules` property in your `eslint.config.mjs`:

```js filename="eslint.config.mjs"
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@next/next/no-page-custom-font': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
```

### With Core Web Vitals

Enable the `eslint-config-next/core-web-vitals` configuration in your ESLint config.

```js filename="eslint.config.mjs"
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
```

`eslint-config-next/core-web-vitals` upgrades certain lint rules in `@next/eslint-plugin-next` from warnings to errors to help improve your [Core Web Vitals](https://web.dev/vitals/) metrics.

> The `eslint-config-next/core-web-vitals` configuration is automatically included for new applications built with [Create Next App](/docs/app/api-reference/cli/create-next-app).

### With TypeScript

In addition to the Next.js ESLint rules, `create-next-app --typescript` will also add TypeScript-specific lint rules with `eslint-config-next/typescript` to your config:

```js filename="eslint.config.mjs"
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
```

Those rules are based on [`plugin:@typescript-eslint/recommended`](https://typescript-eslint.io/linting/configs#recommended).
See [typescript-eslint > Configs](https://typescript-eslint.io/linting/configs) for more details.

### With Prettier

ESLint also contains code formatting rules, which can conflict with your existing [Prettier](https://prettier.io/) setup. We recommend including [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier) in your ESLint config to make ESLint and Prettier work together.

First, install the dependency:

```bash package="pnpm"
pnpm add -D eslint-config-prettier
```

```bash package="npm"
npm i -D eslint-config-prettier
```

```bash package="yarn"
yarn add --dev eslint-config-prettier
```

```bash package="bun"
bun add -d eslint-config-prettier
```

Then, add `prettier` to your existing ESLint config:

```js filename="eslint.config.mjs"
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
  ...nextVitals,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
```

### Running lint on staged files

If you would like to use ESLint with [lint-staged](https://github.com/okonet/lint-staged) to run the linter on staged git files, add the following to the `.lintstagedrc.js` file in the root of your project:

```js filename=".lintstagedrc.js"
const path = require('path')

const buildEslintCommand = (filenames) =>
  `eslint --fix ${filenames
    .map((f) => `"${path.relative(process.cwd(), f)}"`)
    .join(' ')}`

module.exports = {
  '*.{js,jsx,ts,tsx}': [buildEslintCommand],
}
```

## Migrating existing config

If you already have ESLint configured in your application, there are two approaches to integrate Next.js linting rules, depending on your setup.

#### Using the plugin directly

Use `@next/eslint-plugin-next` directly if you have any of the following already configured:

- Conflicting plugins installed separately or through another config (such as `airbnb` or `react-app`):
  - `react`
  - `react-hooks`
  - `jsx-a11y`
  - `import`
- Custom `parserOptions` different from Next.js defaults (only if you have [customized your Babel configuration](/docs/pages/guides/babel))
- `eslint-plugin-import` with custom Node.js and/or TypeScript [resolvers](https://github.com/benmosher/eslint-plugin-import#resolvers)

In these cases, use `@next/eslint-plugin-next` directly to avoid conflicts:

First, install the plugin:

```bash package="pnpm"
pnpm add -D @next/eslint-plugin-next
```

```bash package="npm"
npm i -D @next/eslint-plugin-next
```

```bash package="yarn"
yarn add --dev @next/eslint-plugin-next
```

```bash package="bun"
bun add -d @next/eslint-plugin-next
```

Then add it to your ESLint config:

```js filename="eslint.config.mjs"
import { defineConfig } from 'eslint/config'
import nextPlugin from '@next/eslint-plugin-next'

const eslintConfig = defineConfig([
  // Your other configurations...
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
    },
  },
])

export default eslintConfig
```

This approach eliminates the risk of collisions or errors that can occur when the same plugins or parsers are imported across multiple configurations.

#### Adding to existing config

If you're adding Next.js to an existing ESLint setup, spread the Next.js config into your array:

```js filename="eslint.config.mjs"
import nextConfig from 'eslint-config-next/core-web-vitals'
// Your other config imports...

const eslintConfig = [
  // Your other configurations...
  ...nextConfig,
]

export default eslintConfig
```

When you spread `...nextConfig`, you're adding multiple config objects that include file patterns, plugins, rules, ignores, and parser settings. ESLint applies configs in order, so later rules can override earlier ones for matching files.

> **Good to know:** This approach works well for straightforward setups. If you have a complex existing config with specific file patterns or plugin configurations that conflict, consider using the plugin directly (as shown above) for more granular control.

| Version   | Changes                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v16.0.0` | `next lint` and the `eslint` next.config.js option were removed in favor of the ESLint CLI. A [codemod](/docs/app/guides/upgrading/codemods#migrate-from-next-lint-to-eslint-cli) is available to help you migrate. |
