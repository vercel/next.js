# Example: Firebase authentication with a serverless API

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-firebase-authentication-serverless with-firebase-authentication-serverless-app
# or
yarn create next-app --example with-firebase-authentication-serverless with-firebase-authentication-serverless-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase-authentication-serverless
cd with-firebase-authentication-serverless
```

Set up Firebase:

- Create a project at the [Firebase console](https://console.firebase.google.com/).
- Get your account credentials from the Firebase console at _Project settings > Service accounts_, where you can click on _Generate new private key_ and download the credentials as a json file. It will contain keys such as `project_id`, `client_email` and `client_id`. Set them as environment variables in the `.env` file at the root of this project.
- Get your authentication credentials from the Firebase console under _Project settings > General> Your apps_ Add a new web app if you don't already have one. Under _Firebase SDK snippet_ choose _Config_ to get the configuration as JSON. It will include keys like `apiKey`, `authDomain` and `databaseUrl`. Set the appropriate environment variables in the `.env` file at the root of this project.
- Set the environment variables `SESSION_SECRET_CURRENT` and `SESSION_SECRET_PREVIOUS` in the `.env` file. (These are used by [`cookie-session`](https://github.com/expressjs/cookie-session/#secret).]

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

After `now` successfully deploys, a URL will for your site will be displayed. Copy that URL and navigate to your Firebase project's Authentication tab. Scroll down in the page to "Authorized domains" and add that URL to the list.

## The idea behind the example

This example includes Firebase authentication and serverless [API routes](https://nextjs.org/docs/api-routes/introduction). On login, the app calls `/api/login`, which stores the user's info (their decoded Firebase token) in a cookie so that it's available server-side in `getInitialProps`. On logout, the app calls `/api/logout` to destroy the cookie.
