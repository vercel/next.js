# Example: Firebase authentication with SSR

This example demonstrates server-side rendering with Firebase authentication, providing server-side access to a valid Firebase ID token.

## Before you use this example

Depending on your app's requirements, other approaches may be better.

**If you don't need SSR:** use [with-firebase-authentication](https://github.com/vercel/next.js/tree/canary/examples/with-firebase-authentication) to fetch data from the client side. It's less complicated, and your app will have a quicker initial page load.

**If you don't need server-side access to a Firebase ID token:** consider using [Firebase's session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies). It's less complicated and will likely be quicker to render server-side. However, *you will not be able to access other Firebase services* with the session cookie.

## How it works

On login, we create a custom Firebase token, fetch an ID token and refresh token, and store the ID and refresh tokens in a cookie. On future requests, we verify the ID token server-side; if it's expired, we use the refresh token to get a new one.

The authed user is provided as an isomorphic `AuthUser` object. During SSR and client-side rendering prior to initializing the Firebase JS SDK, `AuthUser` relies on the ID token from the cookie. After the Firebase JS SDK initializes, it relies on the Firebase JS SDK.

The Firebase JS SDK auth state remains the source of truth. On auth state change, we set/unset the auth cookie.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-firebase-authentication with-firebase-authentication-ssr
# or
yarn create next-app --example with-firebase-authentication with-firebase-authentication-ssr
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-firebase-authentication-ssr
cd with-firebase-authentication-ssr
```

## Configuration

Set up Firebase:

- Create a project at the [Firebase console](https://console.firebase.google.com/).
- Copy the contents of `.env.local.example` into a new file called `.env.local`
- Get your account credentials from the Firebase console at _Project settings > Service accounts_, where you can click on _Generate new private key_ and download the credentials as a json file. It will contain keys such as `project_id`, `client_email` and `client_id`. Set them as environment variables in the `.env.local` file at the root of this project.
- Get your authentication credentials from the Firebase console under _Project settings > General> Your apps_ Add a new web app if you don't already have one. Under _Firebase SDK snippet_ choose _Config_ to get the configuration as JSON. It will include keys like `apiKey`, `authDomain` and `databaseUrl`. Set the appropriate environment variables in the `.env.local` file at the root of this project.
- Go to **Develop**, click on **Authentication** and in the **Sign-in method** tab enable authentication for the app.

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

After deploying, copy the deployment URL and navigate to your Firebase project's Authentication tab. Scroll down in the page to "Authorized domains" and add that URL to the list.

## Recommended for production
* Set `secure` and `sameSite` options in `cookies.js`
* Ensure the session secrets in `.env` are unique, sufficiently random, and out of source control

## Future improvements
* Currently, we use client-side redirects to redirect unauthenticated users to the login page. When Next.js supports redirects in `getServerSideProps` (see [RFC](https://github.com/vercel/next.js/discussions/14890)), we should change this.
