# MongoDB and Next.js Example

This example shows how you can use a MongoDB database to support your Next.js application.

## Demo

### [https://with-mongodb-navy.now.sh/](https://with-mongodb-navy.now.sh/)

**Pets** is an application that allows users to add their pets' information (e.g., name, owner's name, diet, age, dislikes, likes, and photo). They can also delete it or edit it anytime.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/with-mongodb-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-mongodb with-mongodb-app
# or
yarn create next-app --example with-mongodb with-mongodb-app
```

## Configuration

### Step 1. Connect MongoDB to the application

Please see the [steps](./link-step.md) on how to connect MongoDB to your application

### Step 2. Set up schema models for the application

Based on the types of data needed for your application, you will modify the type definitions in [Pet.js](./models/Pet.js) as well as the seed data in [Pet-sampleSeed.json](./seed/Pet-sampleSeed.json)

### Step 3. Import sample seed data to your MongoDB

Please see the [steps](./data_import.md) on importing sample seed data into your MongoDB.

### Step 4. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env` (which will be ignored by Git):

```bash
cp .env.example .env
```

Be sure to update the file with your own MongoDB URI connection string (from step 1) and development url:

Then set each variable on `.env`:

- `MONGO_DBURI` should be your MongoDB URI from [step 1](./link-step.md) connection string for your database.
- `VERCEL_URL` should be your development url (for local development) or your production url (see deploy section for more details).

Your `.env` file should look like this:

```bash
MONGO_DBURI=...
VERCEL_URL=...
```

## Install and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables using [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/now-cli#commands/secrets)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI and follow this guide to set up [environment variables](https://vercel.com/blog/environment-variables-ui) in your project.

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
