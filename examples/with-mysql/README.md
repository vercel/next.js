# MySQL Example

This is an example of using [MySQL](https://www.mysql.com/) in a Next.js project.

## Demo

### [https://next-mysql.vercel.app](https://next-mysql.vercel.app/)

## Deploy your own

Once you have access to [the environment variables you'll need](#step-5-set-up-environment-variables), deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-mysql&project-name=nextjs-mysql&repository-name=nextjs-mysql&env=MYSQL_HOST,MYSQL_DATABASE,MYSQL_USERNAME,MYSQL_PASSWORD&envDescription=Required%20to%20connect%20the%20app%20with%20MySQL&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-mysql%23step-2-set-up-environment-variables&demo-title=Next.js%20%2B%20MySQL%20Demo&demo-description=A%20simple%20app%20demonstrating%20Next.js%20and%20MySQL%20&demo-url=https%3A%2F%2Fnext-mysql.vercel.app%2F)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-mysql next-mysql-app
# or
yarn create next-app --example with-mysql next-mysql-app
```

## Configuration

### Step 1. Set up a MySQL database

Set up a MySQL server either locally or any cloud provider.

### Step 2. Set up environment variables

Copy the `env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set each variable on `.env.local`:

- `MYSQL_HOST` - Your MySQL host URL.
- `MYSQL_DATABASE` - The name of the MySQL database you want to use.
- `MYSQL_USERNAME` - The name of the MySQL user with access to database.
- `MYSQL_PASSWORD` - The passowrd of the MySQL user.

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

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-mysql&project-name=nextjs-mysql&repository-name=nextjs-mysql&env=MYSQL_HOST,MYSQL_DATABASE,MYSQL_USERNAME,MYSQL_PASSWORD&envDescription=Required%20to%20connect%20the%20app%20with%20MySQL&envLink=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-mysql%23step-2-set-up-environment-variables&demo-title=Next.js%20%2B%20MySQL%20Demo&demo-description=A%20simple%20app%20demonstrating%20Next.js%20and%20MySQL%20&demo-url=https%3A%2F%2Fnext-mysql.vercel.app%2F)
