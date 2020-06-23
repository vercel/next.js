# With Firebase

This is a simple set up for Firebase for client side applications.

The firebase app is initialized in `firebase/clientApp.js`, to use you just have to import it anywhere in the app

The React Context API is used to provide user state.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-firebase)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-firebase with-firebase-app
# or
yarn create next-app --example with-firebase with-firebase-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase
cd with-firebase
```

### Configuration

1. [Create a Firebase project](https://console.firebase.google.com/u/0/) and add a new app to it.
2. Create a `.env` file and copy the contents of `.env.example` into it:

```bash
cp .env.example .env
```

3. Set each variable on `.env` with your Firebase Configuration (found in "Project settings").

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
