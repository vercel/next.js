# With Cookie Auth and Fauna

In this example, we authenticate users and store a token in a secure (non-JS) cookie. The example only shows how the user session works, keeping a user logged in between pages.

This example uses [Fauna](https://fauna.com/) as the auth service and DB.

The repo includes a minimal auth backend built with the new [API Routes support](https://github.com/zeit/next.js/pull/7296) (`pages/api`), [Micro](https://www.npmjs.com/package/micro), [Fauna for Auth](https://app.fauna.com/tutorials/authentication) and [dotenv](https://github.com/zeit/next.js/tree/canary/examples/with-dotenv) for environment variables. The backend allows the user to create an account (a User document), login, and see their user id (User ref id).

Session is synchronized across tabs. If you logout your session gets removed on all the windows as well. We use the HOC `withAuthSync` for this.

The helper function `auth` helps to retrieve the token across pages and redirects the user if not token was found.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-cookie-auth-fauna with-cookie-auth-fauna-app
# or
yarn create next-app --example with-cookie-auth-fauna with-cookie-auth-fauna-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-cookie-auth-fauna
cd with-cookie-auth-fauna
```

### Run locally

First, you'll need to create an account on [Fauna](https://fauna.com/), then follow these steps:

1. In the [FaunaDB Console](https://dashboard.fauna.com/), click "New Database". Name it whatever you like and click "Save".
2. Click "New Collection", name it `User`, leave "Create collection index" checked, and click "Save".
3. Now go to "Indexes" in the left sidebar, and click "New Index". Select the `User` collection, call it `users_by_email`, and in the "terms" field type `data.email`. Select the "Unique" checkbox and click "Save". This will create an index that allows looking up users by their email, which we will use to log a user in.
4. Next, go to "Security" in the sidebar, then click "New Key". Create a new key with the `Server` role, call it `server-key`, and click "Save". Your key's secret will be displayed, copy that value and paste it as the value for `FAUNA_SERVER_KEY` in the `.env` file at the project root. Keep this key safely as it has privileged access to your database.

> For more information, read the [User Authentication Tutorial in Fauna](https://app.fauna.com/tutorials/authentication).

> **Add `.env` to `.gitignore`**, files with secrets should never be in the cloud, we have it here for the sake of the example.

Now, install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

### Deploy

We'll use [now](https://zeit.co/now) to deploy our app, first we need to add the server key as a secret using [now secrets](https://zeit.co/docs/v2/serverless-functions/env-and-secrets/?query=secrets#adding-secrets), like so:

```bash
now secrets add fauna-secret-key "ENTER YOUR FAUNA SERVER KEY"
```

Then deploy it to the cloud:

```bash
now
```
