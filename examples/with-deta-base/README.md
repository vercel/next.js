# Deta Base Example

An example using [Deta Base](https://docs.deta.sh/docs/base/about) in a Next.js project.

## Deploy your own

Once you have access to [the environment variables you'll need](#step-2-setting-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-deta-base&project-name=with-deta-base&repository-name=with-deta-base&env=DETA_PROJECT_KEY&envDescription=The%20Deta%20Project%20Key%2C%20found%20in%20the%20Deta%20dashboard&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-deta-base%23configuration)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-deta-base with-deta-base-app
# or
yarn create next-app --example with-deta-base with-deta-base-app
```

## Configuration

### Step 1. Create a Deta Account

Create an account on [Deta](https://www.deta.sh/?ref=next.js). Save the default _Project Key_ which will be auto-generated on account creation.

### Step 2. Setting Up Environment Variables

Copy the `.env.local.example` file from this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `DETA_PROJECT_KEY` should be the default _Project Key_ that you saved from step 1.

The resulting `env.local` file should look like this:

```bash
DETA_PROJECT_KEY=...
```

### Step 3. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your todo app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-deta-base&project-name=with-deta-base&repository-name=with-deta-base&env=DETA_PROJECT_KEY&envDescription=The%20Deta%20Project%20Key%2C%20found%20in%20the%20Deta%20dashboard&envLink=https://github.com/vercel/next.js/tree/canary/examples/with-deta-base%23configuration)
