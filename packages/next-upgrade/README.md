# @next/upgrade

Upgrade Next.js apps to newer or beta versions with one command.

```bash
npx @next/upgrade
```

## How to use it?

Simply run `npx @next/upgrade` in your project and follow the few prompts. This will let you choose between the latest canary, release candidate or stable version of Next.js.

You can also pass a specific Next.js version as an argument:

```bash
npx @next/upgrade 15.0.0-canary.148
```

`@next/upgrade` supports `pnpm`, `npm`, `yarn` and `bun`, and is compatible with monorepos.

## Why?

Updating Next.js is not just merely running `pnpm update next` or its equivalent in your package manager of choice. It also involves updating `react`, `@types/react`, `react-dom`, `@types/react-dom`, and potentially other dependencies.

We noticed that trying out new or beta versions of Next.js was not as smooth as it could be, so we created this small tool that makes it easier.

## Contributing

To build the package locally, clone the [@vercel/next repo](https://github.com/vercel/next.js/), navigate to `packages/next-upgrade` and run:

```bash
pnpm build
```

To test your local version of `@next/upgrade`, run `pnpm link --global` from the `@next/upgrade` directory and add the following to the `package.json` of your Next.js app:

```json
"dependencies": {
  "@next/upgrade": "files:path/to/local/next.js/packages/next-upgrade"
}
```

Finally, run `pnpm i` and now you can use your local version of `@next/upgrade` with the standard `npx @next/upgrade` command.
