# Auth & Realtime GraphQL Example Using Next.js and Nhost

This example showcases Next.js as the frontend using [Nhost](https://nhost.io/) as the backend.

## Demo

### [https://nhost-nextjs-example.vercel.app/](https://nhost-nextjs-example.vercel.app/)

## Deploy Your Own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-nhost-auth-realtime-graphql&project-name=with-nhost-auth-realtime-graphql&repository-name=with-nhost-auth-realtime-graphql&env=NEXT_PUBLIC_GRAPHQL_URL,NEXT_PUBLIC_BACKEND_URL&envDescription=Enter%20your%20Nhost%20project%27s%20URLs)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-nhost-auth-realtime-graphql nhost-app
```

```bash
yarn create next-app --example with-nhost-auth-realtime-graphql nhost-app
```

```bash
pnpm create next-app --example with-nhost-auth-realtime-graphql nhost-app
```

## Configuration

### Step 1. Create an account and a project on Nhost

[Create an account and project on Nhost](https://console.nhost.io).

### Step 2. Create `items` database

Go to your project's Hasura console. Go to the **DATA** tab in the top menu and click **SQL** in the bottom left menu.

Then copy the content from `setup/data.sql` in this example and paste it in the **Raw SQL** form in the Hasura Console. Make sure **Track this** is checked and click **Run!**

### Step 3. Add API metadata

Again, in the Hasura console, click on the **gearwheel** (settings) in the top right menu. Click on **Import metadata** and select the file `setup/hasura-metadata.json` in this repository.

### Step 4. Add environment variables

Copy `.env.local.example` to `.env.local` and update the two URLs with your Nhost project URLs. You find the URLs in the Nhost console dashboard of your project.

### Step 5. Run Next.js in development mode

```bash
npm install
npm run dev
# or
yarn install
yarn dev
# or
pnpm install
pnpm dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 6. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
