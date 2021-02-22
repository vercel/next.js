# Amplication Graphql Starter Example -- The Guestbook

This simple Guestbook SPA example shows you how to use [Amplication's GraphQL endpoint](https://docs.amplication.com/docs/api#graphql-api) in your Next.js project.

## Why Amplication

Amplication is an open‑source development tool. It helps professional Node.js developers to develop quality Node.js applications without spending time on repetitive coding tasks.

Amplication auto-generates fully functional apps based on TypeScript and Node.js.

## How to use

You can start with this template [using `create-next-app`](#using-create-next-app) or by [downloading the repository manually](#download-manually).

To use a live Amplication backend, create an app at [amplication.com](https://amplication.com/). Once you are in the app dashboard, go to the 'Entities' tab and create a GuestbookEntry entity with the following fields:

`ID` - (auto generated)
`Created At` - (auto generated)
`Updated At` - (auto generated)
`twitter_handle` - (type: Single Line Text)
`story` - (type: Multi Line Text)

Once you've added the fields to the entity, commit the pending changes in the 'Pending Changes' tab. Committing the change will cause Amplication to generate a new NestJS app with a Postgres backend and GraphQL resolvers for the entities you've defined. As that's being done, you will see a Build Id in the bottom bar showing the progress of the generated app build process. Once that's complete, you should see a 'Open Sandbox environment' button next to 'Download Code' in the bottom bar. For this example, you can choose to use the free hosted Sandbox environment or host the app yourself but running the downloaded generated code on a cloud platform (or locally).

You will need to create a `.env.local`[file](https://nextjs.org/docs/basic-features/environment-variables) at the root of this example project with two environment variables: `NEXT_PUBLIC_AMPLICATION_GRAPHQL_ENDPOINT` and `NEXT_PUBLIC_AMPLICATION_SECRET` - you can refer to `.env.local.example` for an example of what the file should look like.

`NEXT_PUBLIC_AMPLICATION_GRAPHQL_ENDPOINT` - Set this to GraphQL endpoint URL of your Amplication app. If you are using the Sandbox environment, click the 'Open Sandbox environment' button and the url of that page (with a trailing `/graphql` path) should be the value of this environment variable.

`NEXT_PUBLIC_AMPLICATION_SECRET` - Set this to your [Amplication credentials secret](https://docs.amplication.com/docs/api#authentication), which is the is the Base64 encoding of a string `username:password` with your user credentials. By default, your app comes with one user with the username "admin" and password "admin". You can use the following header to authenticate with the default user, so the secret would be `YWRtaW46YWRtaW4=`. You can access your app's Admin dashboard and create a new User to set your own username and password.

With these two variables set, you should be able to start up your app with a fully functional backend and database.

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```
npx create-next-app --example with-graphql-amplication with-graphql-amplication-app
# or
yarn create next-app --example with-graphql-amplication with-graphql-amplication-app
```

### Run locally

Install packages, then run the development server:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)!
