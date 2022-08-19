# Linting

The Next.js repository runs [ESLint](TODO) and [Prettier](TODO) to lint and format all code.

To lint all code you can run:

```sh
pnpm lint
```

If you get errors, you can run the ESLint and Prettier auto-fix using:

```sh
pnpm lint-fix
```

Not all rules can be auto-fixed, those require manual changes.

## ESLint

You can find the enabled rules in the [ESLint config](../../.eslintrc.json).

We recommend installing the [ESLint plugin for VS Code](TODO).

## Prettier

We recommend installing the [Prettier plugin for VS Code](TODO).

You can find the format configuration in the [Prettier config](../../.prettierrc.json).
