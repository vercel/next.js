# Example app with react-with-styles

This example features how you use a different styling solution than [styled-jsx](https://github.com/zeit/styled-jsx) that also supports universal styles.
That means we can serve the required styles for the first render within the HTML and then load the rest in the client.
In this case we are using [react-with-styles](https://github.com/airbnb/react-with-styles).

For this purpose we are extending the `<Document />` and injecting the server side rendered styles into the `<head>`.

We are using `pages/_index.js` from this example [with-aphrodite](https://github.com/vercel/next.js/tree/master/examples/with-aphrodite).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-react-with-styles)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-react-with-styles with-react-with-styles-app
# or
yarn create next-app --example with-react-with-styles with-react-with-styles-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
