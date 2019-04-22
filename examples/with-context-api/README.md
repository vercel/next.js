# Hello World example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-context-api with-context-api-app
# or
yarn create next-app --example with-context-api with-context-api-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-context-api
cd with-context-api
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

## The idea behind the example\*

This example shows how to use react context api in our app.

It provides an example of using `pages/_app.js` to include include the context api provider and then shows how both the `pages/index.js` and `pages/about.js` can both share the same data using the context api consumer.

The `pages/index.js` shows how to, from the home page, increment and decrement the context data by 1 (a hard code value in the context provider itself).

The `pages/about.js` shows how to, from the about page, how to pass an increment value from the about page into the context provider itself.

\*_Based on WesBos example_.
