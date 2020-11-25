# Dark mode with styled components and typescript

Due to the pre-rendering (SSG / SSR), placing a dark mode that can be saved in localStorage becomes surprisingly complicated, because during compilation time we do not have access to localStorage. This causes several complications, because the only way to access localStorage is on the client side and trying to do this only on the client side causes a bug that is the flash in changing themes. There are several ways to solve this ... like this example using CSS variables and styled-components.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/darkmode-styled-components-ts)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example darkmode-styled-components-typescript darkmode-styled-components-typescript-app
# or
yarn create next-app --example darkmode-styled-components-typescript darkmode-styled-components-typescript-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
