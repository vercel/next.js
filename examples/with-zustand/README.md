# Zustand example

This example shows how to integrate [Zustand](https://github.com/react-spring/zustand) in Next.js.

Usually splitting your app state into `pages` feels natural but sometimes you'll want to have global state for your app. This is an example on how you can use zustand that also works with Next.js's universal rendering approach.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-zustand)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-zustand with-zustand-app
# or
yarn create next-app --example with-zustand with-zustand-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-zustand
cd with-zustand
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Notes

In the first example we are going to display a digital clock that updates every second. The first render is happening in the server and then the browser will take over. To illustrate this, the server rendered clock will have a different background color (black) than the client one (grey).

On the server side every request initializes a new store, because otherwise different user data can be mixed up. On the client side the same store is used, even between page changes.
