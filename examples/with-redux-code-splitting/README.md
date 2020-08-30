# Redux with code splitting example

Redux uses single store per application and usually it causes problems for code splitting when you want to load actions and reducers used on the current page only.

This example utilizes [fast-redux](https://github.com/dogada/fast-redux) to split Redux's actions and reducers across pages. In result each page's javascript bundle contains only code that is used on the page. When user navigates to a new page, its actions and reducers are connected to the single shared application store.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-redux-code-splitting)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-redux-code-splitting with-redux-code-splitting-app
# or
yarn create next-app --example with-redux-code-splitting with-redux-code-splitting-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
