# With Firebase Client-Side

This is a simple set up for Firebase on the client side. It uses React Context to store some data about the state of your Firebase app. It's all client side, so no custom server.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-firebase-client-side)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-firebase-client-side with-firebase-client-side-app
# or
yarn create next-app --example with-firebase-client-side with-firebase-client-side-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase-client-side
cd with-firebase-client-side
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

### Setting up Firebase

- Create a [Firebase project](https://console.firebase.google.com/u/0/).
- Fill in your credentials at `/credentials/client`
- Done!

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
