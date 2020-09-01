# ReactMD, Next.js, and Typescript Example

This example sets up a simple [ReactMD](https://github.com/mlaursen/react-md), Next.js, and Typescript
app featuring:

- [\_variables.scss](./styles/_variables.scss) to override the default
  `react-md` theme and feature toggles
- [app.scss](./styles/app.scss) global styles that conditionally apply the dark theme
  based on the user's OS preferences
- a custom [\_app.tsx](./pages/_app.tsx) that uses a persistent layout
- a reusable [Layout.tsx](./components/Layout/Layout.tsx) that:
  - updates all the icons to use `SVGIcon`s instead of `FontIcon`s
  - initializes the `Layout` component from `react-md` with navigation items

For more information about ReactMD's features, styling, components, and API, check out
the [main documentation](https://react-md.dev). You can also view the
[documentation site's source code](https://github.com/mlaursen/react-md/tree/master/packages/documentation)
for a more complex example of using ReactMD + Next.js.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-react-md-typescript)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-react-md-typescript with-react-md-typescript-app
# or
yarn create next-app --example with-react-md-typescript with-react-md-typescript-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
