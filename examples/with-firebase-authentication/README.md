# Example: Firebase authentication with a serverless API

This example includes Firebase authentication and serverless [API routes](https://nextjs.org/docs/api-routes/introduction).

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-firebase-authentication with-firebase-authentication-app
# or
yarn create next-app --example with-firebase-authentication with-firebase-authentication-app
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
