# ReactMD and Next.js Example

This example sets up a simple [ReactMD](https://github.com/mlaursen/react-md) and Next.js
app featuring:

- [\_variables.scss](./styles/_variables.scss) to override the default
  `react-md` theme and feature toggles
- [app.scss](./styles/app.scss) global styles that conditionally apply the dark theme
  based on the user's OS preferences
- a custom [\_app.jsx](./pages/_app.jsx) that uses a persistent layout
- a reusable [Layout.jsx](./components/Layout/Layout.jsx) that:
  - updates all the icons to use `SVGIcon`s instead of `FontIcon`s
  - initializes the `Layout` component from `react-md` with navigation items

For more information about ReactMD's features, styling, components, and API, check out
the [main documentation](https://react-md.dev). You can also view the
[documentation site's source code](https://github.com/mlaursen/react-md/tree/master/packages/documentation)
for a more complex example of using ReactMD + Next.js or the [with-react-md-typescript](../with-react-md-typescript)
example for Typescript support.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-react-md)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-react-md&project-name=with-react-md&repository-name=with-react-md)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-react-md with-react-md-app
```

```bash
yarn create next-app --example with-react-md with-react-md-app
```

```bash
pnpm create next-app --example with-react-md with-react-md-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
