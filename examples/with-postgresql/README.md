# PostgreSQL Example

This is an example of using [PostgreSQL](https://www.postgresql.org/) in a Next.js project.

## Demo

### [https://next-postgres.vercel.app](https://next-postgres.vercel.app/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-5-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-postgres&env=POSTGRESQL_HOST,POSTGRESQL_PORT,POSTGRESQL_USERNAME,POSTGRESQL_PASSWORD,POSTGRESQL_DATABASE&project-name=nextjs-postgres&repo-name=nextjs-postgres&envDescription=Required%20to%20connect%20the%20app%20with%20PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-postgres%23step-2-set-up-environment-variables&demo-title=Next.js%20%2B%20PostgreSQL%20Demo&demo-description=A%20simple%20app%20demonstrating%20Next.js%20and%20PostgreSQL%20&demo-url=https%3A%2F%2Fnext-postgres.vercel.app%2F)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-postgres next-postgres-app
# or
yarn create next-app --example with-postgres next-postgres-app
```

## Configuration

### Step 1. Set up a PostgreSQL database

Set up a PostgreSQL server either locally or any cloud provider.

### Step 2. Set up environment variables

Copy the `env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set each variable on `.env.local`:

- `POSTGRESQL_HOST` - Your PostgreSQL host URL.
- `POSTGRESQL_PORT` - Your PostgreSQL port.
- `POSTGRESQL_USERNAME` - The name of the PostgreSQL user with access to database.
- `POSTGRESQL_PASSWORD` - The password of the PostgreSQL user.
- `POSTGRESQL_DATABASE` - The name of the PostgreSQL database you want to use.

### Step 3. Run migration script

You'll need to run a migration to create the necessary table for the example.

```bash
npm run migrate
# or
yarn migrate
```

### Step 4. Run Next.js in development mode

```bash
npm install
npm run dev
# or
yarn install
yarn dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/zeit/next.js/discussions).

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-postgres&env=POSTGRES_HOST,POSTGRES_PORT,POSTGRES_USERNAME,POSTGRES_PASSWORD,POSTGRES_DATABASE&project-name=nextjs-postgres&repo-name=nextjs-postgres&envDescription=Required%20to%20connect%20the%20app%20with%20PostgreSQL&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-postgres%23step-2-set-up-environment-variables&demo-title=Next.js%20%2B%20PostgreSQL%20Demo&demo-description=A%20simple%20app%20demonstrating%20Next.js%20and%20PostgreSQL%20&demo-url=https%3A%2F%2Fnext-postgres.vercel.app%2F)
