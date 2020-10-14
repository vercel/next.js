# Using Next.js with Saleor

This is an example of how [Saleor](https://saleor.io/) can be used with `Next.js`

## Deploy your own

Once you have access to [the environment variables you'll need](#step-1-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/with-saleor&env=SALEOR_URL&envDescription=Required%20to%20connect%20the%20app%20with%20Saleor&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-saleor%23step-1-set-up-environment-variables)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-saleor with-saleor-app
# or
yarn create next-app --example with-saleor with-saleor-app
```

## Configuration

First, you'll need to [setup Saleor API](https://github.com/mirumee/saleor) if you don't have one already. Once that's done, follow the steps below.

### Step 1. Set up environment variables

First, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set variable on `.env.local`:

- `SALEOR_URL` should be the GraphQL API url of Saleor instance.

### Step 2. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 3. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/with-saleor&env=SALEOR_URL&envDescription=Required%20to%20connect%20the%20app%20with%20Saleor&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-saleor%23step-1-set-up-environment-variables)
