# Example app with [chakra-ui](https://github.com/chakra-ui/chakra-ui) and TypeScript

This example features how to use [chakra-ui](https://github.com/chakra-ui/chakra-ui) as the component library within a Next.js app with TypeScript.

Next.js and chakra-ui have built-in TypeScript declarations, so we'll get autocompletion for their modules straight away.

We are connecting the Next.js `_app.js` with `chakra-ui`'s Provider and theme so the pages can have app-wide dark/light mode. We are also creating some components which shows the usage of `chakra-ui`'s style props.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-chakra-ui&project-name=with-chakra-ui&repository-name=with-chakra-ui)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-chakra-ui with-chakra-ui-app
```

```bash
yarn create next-app --example with-chakra-ui with-chakra-ui-app
```

```bash
pnpm create next-app --example with-chakra-ui with-chakra-ui-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

Chakra has supported Gradients and RTL in `v1.1`. To utilize RTL, [add RTL direction and swap](https://chakra-ui.com/docs/features/rtl-support).

If you don't have multi-direction app, you should make `<Html lang="ar" dir="rtl">` inside `_document.ts`.
