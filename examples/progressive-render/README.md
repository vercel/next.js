# Example app implementing progressive server-side render

Sometimes you want to **not** server render some parts of your application.

For example:

1. Third party components without server render capabilities
2. Components that depend on `window` or other browser only APIs
3. Content isn't important enough for the user (eg. below the fold content)

To handle these cases, you can conditionally render your component using the `useEffect` hook.

This example features:

- A custom hook called `useMounted`, implementing this behavior
- An app with a component that must only be rendered in the client
- A loading component that will be displayed before rendering the client-only component

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/progressive-render)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example progressive-render progressive-render-app
# or
yarn create next-app --example progressive-render progressive-render-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/progressive-render
cd progressive-render
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
