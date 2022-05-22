# NextJs + Styled-components + TypeScript

This example features how you use a different styling solution than styled-jsx that also supports universal styles. That means we can serve the required styles for the first render within the HTML and then load the rest in the client. In this case we are using styled-components with typescript support.

For this purpose we are extending the <Document /> and injecting the server side rendered styles into the <head>, and also adding the babel-plugin-styled-components (which is required for server side rendering). Additionally we set up a global theme for styled-components using NextJS custom <App> component.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/DIRECTORY_NAME&project-name=DIRECTORY_NAME&repository-name=DIRECTORY_NAME)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-styled-components-typescript with-styled-components-typescript-app
# or
yarn create next-app --example with-styled-components-typescript with-styled-components-typescript-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).