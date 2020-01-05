# Example app with react-with-styles

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-react-with-styles)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-with-styles with-react-with-styles-app
# or
yarn create next-app --example with-react-with-styles with-react-with-styles-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-with-styles
cd with-react-with-styles
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

This example features how you use a different styling solution than [styled-jsx](https://github.com/zeit/styled-jsx) that also supports universal styles.
That means we can serve the required styles for the first render within the HTML and then load the rest in the client.
In this case we are using [react-with-styles](https://github.com/airbnb/react-with-styles).

For this purpose we are extending the `<Document />` and injecting the server side rendered styles into the `<head>`.

We are using `pages/_index.js` from this example [with-aphrodite](https://github.com/zeit/next.js/tree/master/examples/with-aphrodite).
