# Example app with carbon-components-react

This example features how you use IBM's [carbon-components-react](https://github.com/IBM/carbon-components-react) [(Carbon Design System)](http://www.carbondesignsystem.com/components/overview) with Next.js.

Create your own theme with Carbon Design System's [theming tools](http://themes.carbondesignsystem.com/) and put it all together as demonstrated in `static/myCustomTheme.scss`

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-carbon-components)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-carbon-components with-carbon-components-app
# or
yarn create next-app --example with-carbon-components with-carbon-components-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Optimizations

In this example we import carbon components in the `styles/custom-theme.scss` file like this:
@import '~carbon-components/scss/globals/scss/styles.scss';

When we start to consider the performance of this approach, however, it becomes clear that this will include every single bit of CSS that Carbon outputs. Sometimes, you totally need everything that the project provides, but for a good number of teams you may find yourself using only a subset of our components. Here is a great article about how you can optimize your application using carbon components:
https://medium.com/carbondesign/minimal-css-with-carbon-b0c089ccfa71
