# Google Sign In

This example shows how you can authenticate users in your next.js application using [Google Sign-In](https://developers.google.com/identity/sign-in/web).
There are three strategies for implementing Google Sign-In in your application:

#### 1. Client-side Sign-In only [(docs)](https://developers.google.com/identity/sign-in/web/sign-in)

Use this method if you just need to identify the user on the frontend. Use cases for this could be to
restrict certain pages to signed-in users only or to display basic Google profile information of a signed-in user.

#### 2. Client-side Sign-In with token verification on the server [(docs)](https://developers.google.com/identity/sign-in/web/backend-auth)

When a user signs in, the Google OAuth server sends back an `id_token`, which you pass on to your own server as a Bearer token in the 'Authorization' header.
After decoding the `id_token` on the server with [google-auth-library](https://www.npmjs.com/package/google-auth-library),
you can use the user's basic profile information that were stored in the JWT's payload (e.g. email address) and store it in your database.

#### 3. Client-side Sign-In with offline Google API access on the server [(docs)](https://developers.google.com/identity/sign-in/web/server-side-flow)

The final example grants your application 'offline access'. After a user signs in, the Google OAuth server return a one-time code, which you
can then send to your server. On your server, you can use this one-time code to obtain an access and refresh token pair for this user, so that
you can make requests to Google APIs on the user's behalf (based on granted permission scopes), even when the user is not currently signed into your application.

Before you begin, you need to create a Google API Console project to obtain a client ID and client secret. You also need to enable the Google Drive API to use strategy No. 3.
Once you're done, you need to create a `next.config.js` file and fill in your ID, secret, and a redirect URI:

```JavaScript
module.exports = {
    env: {
        google_client_id: 'your-id',
        google_client_secret: 'your-secret',
        google_redirect_uri: 'http://localhost:3000',
    },
};
```

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-google-signin)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-google-signin with-google-signin-app
# or
yarn create next-app --example with-google-signin with-google-signin-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-google-signin
cd with-google-signin
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
