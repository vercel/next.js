# With Firebase Client-Side

This is a simple set up for Firebase on the client side. All client side, so no custom server.

The firebase app is initialized in `firebase/clientApp.js`. You'll need to `import firebase from '<path>/firebase/clientApp'` to use the initialized app. It also uses React Context API to provide user state.

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

### Configuration

1. [Create a Firebase project](https://console.firebase.google.com/u/0/) and an app inside of it.
2. Copy the `.env.example` file in this directory to `.env` (which will be ignored by Git).
3. Create a `.env` file and copy the contents of `.env.example` into it. You can safely delete the `.env.example` file.
4. Set each variable on `.env` with your Firebase Configuration (found in "Project settings").

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
