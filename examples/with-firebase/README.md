# Firebase Example

This is a simple set up for Firebase for client side applications.

The firebase app is initialized in `firebase/clientApp.js`, to use you just have to import it anywhere in the app

The React Context API is used to provide user state.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-firebase)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-firebase with-firebase-app
# or
yarn create next-app --example with-firebase with-firebase-app
```

## Configuration

1. [Create a Firebase project](https://console.firebase.google.com/u/0/) and add a new app to it.
2. Create a `.env.local` file and copy the contents of `.env.local.example` into it:

```bash
cp .env.local.example .env.local
```

3. Set each variable on `.env.local` with your Firebase Configuration (found in "Project settings").

4. If you want to check the SSR page, get your account credentials from the Firebase console at _Project settings > Service accounts_, where you can click on _Generate new private key_ and download the credentials as a json file. Then set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` in `.env.local`

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.
