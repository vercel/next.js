# Next.js and Auth0 Example

This example shows how you can use `@auth0/nextjs-auth` to easily add authentication support to your Next.js application. It tries to cover a few topics:

- Signing in
- Signing out
- Loading the user on the server side and adding it as part of SSR ([`pages/advanced/ssr-profile.tsx`](pages/advanced/ssr-profile.tsx))
- Loading the user on the client side and using fast/cached SSR pages ([`pages/index.tsx`](pages/index.tsx))
- Loading the user on the client side and checking authentication CSR pages ([`pages/profile.tsx`](pages/profile.tsx))
- Loading the user on the client side by accessing API (Serverless function) CSR pages ([`pages/advanced/api-profile.tsx`](pages/advanced/api-profile.tsx))
- Creates route handlers under the hood that perform different parts of the authentication flow ([`pages/auth/[...auth0].tsx`](pages/auth/[...auth0].tsx))

Read more: [https://auth0.com/blog/ultimate-guide-nextjs-authentication-auth0/](https://auth0.com/blog/ultimate-guide-nextjs-authentication-auth0/)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example auth0 auth0-app
```

```bash
yarn create next-app --example auth0 auth0-app
```

```bash
pnpm create next-app --example auth0 auth0-app
```

## Configuring Auth0

1. Go to the [Auth0 dashboard](https://manage.auth0.com/) and create a new application of type _Regular Web Applications_ and make sure to configure the following
2. Go to the settings page of the application
3. Configure the following settings:

- _Allowed Callback URLs_: Should be set to `http://localhost:3000/api/auth/callback` when testing locally or typically to `https://myapp.com/api/auth/callback` when deploying your application.
- _Allowed Logout URLs_: Should be set to `http://localhost:3000/` when testing locally or typically to `https://myapp.com/` when deploying your application.

4. Save the settings

### Set up environment variables

To connect the app with Auth0, you'll need to add the settings from your Auth0 application as environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then, open `.env.local` and add the missing environment variables:

- `AUTH0_ISSUER_BASE_URL` - Can be found in the Auth0 dashboard under `settings`. (Should be prefixed with `https://`)
- `AUTH0_CLIENT_ID` - Can be found in the Auth0 dashboard under `settings`.
- `AUTH0_CLIENT_SECRET` - Can be found in the Auth0 dashboard under `settings`.
- `AUTH0_BASE_URL` - The base url of the application.
- `AUTH0_SECRET` - Has to be at least 32 characters. You can use [this generator](https://generate-secret.vercel.app/32) to generate a value.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.
