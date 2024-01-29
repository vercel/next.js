# Linting

The Next.js repository runs [ESLint](https://eslint.org), [Prettier](https://prettier.io) and [alex](https://alexjs.com) to lint and format all code and documentation.

To lint all code you can run:

```sh
pnpm lint
```

If you get errors, you can run the ESLint and Prettier auto-fix using:

```sh
pnpm lint-fix
```

Not all rules can be auto-fixed, some require manual changes.

If you get a warning by alex, follow the instructions to correct the language.

## ESLint

We recommend installing the [ESLint plugin for VS Code](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).

You can find the enabled rules in the [ESLint config](../../.eslintrc.json).

## Prettier

We recommend installing the [Prettier plugin for VS Code](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

You can find the format configuration in the [Prettier config](../../.prettierrc.json).

## alex

We recommend installing the [AlexJS Linter extension for VSCode](https://marketplace.visualstudio.com/items?itemName=TLahmann.alex-linter)

You can find the configuration in the [alex config](../../.alexrc).
