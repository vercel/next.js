# With react-toolbox example

This is a simple example of getting react-toolbox up and running, using [react-toolbox-themr](https://github.com/react-toolbox/react-toolbox-themr).

For actual use, you probably also want to add Roboto Font, and Material Design Icons. See <http://react-toolbox.io/#/install>

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-react-toolbox)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-react-toolbox&project-name=with-react-toolbox&repository-name=with-react-toolbox)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-react-toolbox with-react-toolbox-app
```

```bash
yarn create next-app --example with-react-toolbox with-react-toolbox-app
```

```bash
pnpm create next-app --example with-react-toolbox with-react-toolbox-app
```

Notice that `yarn toolbox` (or `npm run toolbox`) should be rerun every time the `"reactToolbox"` configuration in `package.json` is changed, in order to update `/theme.js` and `public/theme.css`. The `"reactToolbox"` configuration includes styling, and the list of react-toolbox components to include.

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
