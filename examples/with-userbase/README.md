# Userbase Example

This is an example of using [Userbase](https://userbase.com) in a Next.js project.

Deployed Demo: [https://next-userbase.vercel.app](https://next-userbase.vercel.app)

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-userbase&project-name=with-userbase&repository-name=with-userbase&env=NEXT_PUBLIC_USERBASE_APP_ID&envDescription=The%20Userbase%20app%20ID,%20found%20in%20the%20Userbase%20dashboard&envLink=https://v1.userbase.com/)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-userbase next-userbase-app
```

```bash
yarn create next-app --example with-userbase next-userbase-app
```

```bash
pnpm create next-app --example with-userbase next-userbase-app
```

## Configuration

### Step 1. Create an account on Userbase

First, [create an account on Userbase](https://userbase.com).

After creating an account, make note of your _App ID_ which you'll be needing later.

### Step 2. Setting up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set the variable on `.env.local`:

- `NEXT_PUBLIC_USERBASE_APP_ID` should be the _App ID_ from when you created your Userbase account.

Your `.env.local` file should look like this:

```bash
NEXT_PUBLIC_USERBASE_APP_ID=...
```

### Step 3. Run Next.js in development mode

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

Your todo app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-userbase&project-name=with-userbase&repository-name=with-userbase&env=NEXT_PUBLIC_USERBASE_APP_ID&envDescription=The%20Userbase%20app%20ID,%20found%20in%20the%20Userbase%20dashboard&envLink=https://v1.userbase.com/)
