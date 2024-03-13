# Objective Example

This is an example of using [Objective](https://objective.inc) in a Next.js project.

## Deploy your own

Once you have access to [the environment variables you'll need](#step-2-setting-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-objective&env=OBJECTIVE_API_KEY,OBJECTIVE_INDEX_ID&envDescription=API%20Key%20and%20Index%20ID%20retrieved%20during%20onboarding)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-objective next-objective-app
# or
yarn create next-app --example with-objective next-objective-app
# or
pnpm create next-app --example with-objective next-objective-app
```

## Configuration

### Step 1. Create an account on Objective

First, [create an account on Objective](https://app.objective.inc).

After following the quickstart example, make note of your API Key, and Index ID which you'll be needing later.

### Step 2. Setting up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set the variable on `.env.local`:

- `OBJECTIVE_API_KEY` should be the API Key from when you went through the quickstart.
- `OBJECTIVE_INDEX_ID` should be the ID of the Index you created in the quickstart.

Your `.env.local` file should look like this:

```bash
OBJECTIVE_API_KEY=...
OBJECTIVE_INDEX_ID=
```

### Step 3. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-objective&env=OBJECTIVE_API_KEY,OBJECTIVE_INDEX_ID&envDescription=API%20Key%20and%20Index%20ID%20retrieved%20during%20onboarding)

## Notes

Since this repository uses Next/image, ensure that whatever domain you are serving images from is whitelisted in your `next.config.mjs` file. 