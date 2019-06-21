# Custom server with TypeScript + Nodemon example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-i18next with-react-i18next-app
# or
yarn create next-app --example with-react-i18next with-react-i18next-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-i18next
cd with-react-i18next
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

This example app shows how to integrate [react-i18next][https://react.i18next.com/"] with Next.
The goal is to show how to use it with SSR in the most simpliest way, that's why this example will not use any Backend but local resources within the config.

### Translation Management

During the first hit to the express server, the custom detector will specify the language and store information in the req object.
Then within the \_app getInitialProps we use the req.i18n object to populate some props to the provider (mandatory for SSR, see <https://react.i18next.com/latest/ssr).>

To change langue just add `?lng=fr` to switch to french.
