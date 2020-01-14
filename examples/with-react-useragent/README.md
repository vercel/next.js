# react-useragent example

Show how to setup [@quentin-sommer/react-useragent](https://github.com/quentin-sommer/react-useragent) using next.js client side and server side rendering.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-react-useragent)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-useragent with-react-useragent-app
# or
yarn create next-app --example with-react-useragent with-react-useragent-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-useragent
cd with-react-useragent
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

This example shows how to add user-agent awarness to your next.js app and set it up for server side rendering. It will enable you to directly detect the device from the server side.

You can then decide what to render depending on the device. For example:

- Smaller image for phones
- Dedicated download button fos iOS devices.

The example uses the `pages/_app.js` file to automatically injectuser-agent detection in all your pages.
