# Example app with glamor

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-glamor with-glamor-app
# or
yarn create next-app --example with-glamor with-glamor-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-glamor
cd with-glamor
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example features how to use a different styling solution than [styled-jsx](https://github.com/zeit/styled-jsx) that also supports universal styles. That means we can serve the required styles for the first render within the HTML and then load the rest in the client. In this case we are using [glamor](https://github.com/threepointone/glamor).

For this purpose we are extending the `<Document />` and injecting the server side rendered styles into the `<head>`.

In this example a custom React.createElement is used. With the help of a babel plugin we can remove the extra boilerplate introduced by having to import this function anywhere the css prop would be used. Documentation of using the `css` prop with glamor [can be found here](https://github.com/threepointone/glamor/blob/master/docs/createElement.md)
