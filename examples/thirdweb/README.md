## Example app using Thirdweb

[Thirdweb](https://www.mongodb.com/) is the complete web3 development toolkit. This example will show you how to connect to wallets and run write functions using Thirdweb.

If you want to learn more about MongoDB, visit the following pages:

- [Thirdweb Documentation](https://portal.thirdweb.com/)

## Deploy your own

Once you have access to the environment variables you'll need, deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/thirdweb&project-name=thirdweb&repository-name=thirdweb)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example thirdweb thirdweb-app
```

```bash
yarn create next-app --example thirdweb thirdweb-app
```

```bash
pnpm create next-app --example thirdweb thirdweb-app
```

## Configuration

### Set up environment variables

Copy the `env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set each variable on `.env.local`:

- `NEXT_PUBLIC_TEMPLATE_CLIENT_ID` - Your Thirdweb client id. You can create [CLIENT_ID here](https://thirdweb.com/dashboard/settings/api-keys) by clicking the "Connect" button for your account.

### Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

When you are successfully connected, you can refer to the [Thirdweb React docs](https://portal.thirdweb.com/react/v4) for further instructions on interacting with smart contracts.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).
