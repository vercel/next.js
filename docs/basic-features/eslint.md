---
description: Next.js uses ESLint to make it easier to find and resolve issues that affect user or
developer experience.
---

# ESLint

Next.js uses [ESLint](https://eslint.org/) to make it easier to find and resolve issues that affect
user or developer experience. A minimal set of Next.js rules are provided by default, but can be
extended by adding an `.eslintrc` file to your project.

## Default configuration

By default, Next.js provides a set of [recommended ESLint
rules](https://github.com/vercel/next.js/blob/canary/packages/eslint-plugin-next/lib/index.js#L10-L18)
that are automatically linted against as part of `next build`. If you would like to control which
ESLint rules are checked during builds, you will need to add an `.eslintrc` file to the root of your
project.

Here's an example of an `.eslintrc.json` file:

```json
{
  "extends": ["plugin:@next/next/recommended"],
  "parserOptions": {
    "ecmaVersion": 2018,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true,
      "modules": true
    }
  }
}
```

- Extending the original base of rules (`plugin:@next/next/recommended`) is highly recommended to
  catch and fix significant Next.js issues in your application
- Specify `parserOptions` in the same way as the above example to enable appropriate language
  features

> If you add an `.eslintrc` file to your application and not include `plugin:@next/next/recommended`
> to the config, its rules will not be checked during development or production builds. This is
> **not recommended**.

If you want to enable ESLint to run during development, or disable it for production builds; refer
to the documentation for [ESLint Warnings and
Errors](/docs/api-reference/next.config.js/eslint-warnings-errors.md).
