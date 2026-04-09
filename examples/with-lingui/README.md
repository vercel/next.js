# With Lingui example

This example shows a way to use [Lingui](https://lingui.dev) with next.js.

It adds a webpack loader for the messages to avoid having to manually compile while developing as well as adds the compile step to the `next build` script for production builds.

The example also uses a Higher order Component which can be added to all pages which will be translated and that checks for a `?lang` query string switch the language. Next.js will dynamically load in the messages for the locale when navigating using a Next.js `<Link />` component.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-lingui&project-name=with-lingui&repository-name=with-lingui)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-lingui with-lingui-app
```

```bash
yarn create next-app --example with-lingui with-lingui-app
```

```bash
pnpm create next-app --example with-lingui with-lingui-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### How to add more translated strings

To add new strings use the [react component](https://lingui.dev/tutorials/react-patterns) `<Trans />` and then run `yarn export` to export the messages into `locale/{language}/messages.po`.

### How to add another language

To add another language simply run `yarn add-locale <locale ...>` and it will create a new locale in the `locale/messages/` directory.
