# Example app with glamor

This example features how to use a different styling solution than [styled-jsx](https://github.com/zeit/styled-jsx) that also supports universal styles. That means we can serve the required styles for the first render within the HTML and then load the rest in the client. In this case we are using [glamor](https://github.com/threepointone/glamor).

For this purpose we are extending the `<Document />` and injecting the server side rendered styles into the `<head>`.

In this example a custom React.createElement is used. With the help of a babel plugin we can remove the extra boilerplate introduced by having to import this function anywhere the css prop would be used. Documentation of using the `css` prop with glamor [can be found here](https://github.com/threepointone/glamor/blob/master/docs/createElement.md)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-glamor)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-glamor with-glamor-app
# or
yarn create next-app --example with-glamor with-glamor-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
