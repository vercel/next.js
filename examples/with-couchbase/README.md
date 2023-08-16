## Example app using Couchbase

[Couchbase](https://www.couchbase.com/) is a modern database for enterprise applications. This example will show you how to connect to and use Couchbase in your Next.js app.

If you want to learn more about Couchbase, visit the following pages:

- [Couchbase Docs](https://docs.couchbase.com/)
- [Couchbase Developer Portal](https://developer.couchbase.com/)
- [Couchbase Cloud](https://cloud.couchbase.com/sign-up)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) once you have access to the environment variables you'll need or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-couchbase)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-couchbase&project-name=with-couchbase&repository-name=with-couchbase&env=COUCHBASE_USER,COUCHBASE_PASSWORD,COUCHBASE_ENDPOINT,COUCHBASE_BUCKET,IS_CLOUD_INSTANCE&envDescription=Required%20to%20connect%20the%20app%20with%20Couchbase)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-couchbase with-couchbase-app
```

```bash
yarn create next-app --example with-couchbase with-couchbase-app
```

```bash
pnpm create next-app --example with-couchbase with-couchbase-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Configuration

### Set up a Couchbase database

Set up a Couchbase database either locally or with [Couchbase Cloud](https://cloud.couchbase.com/sign-up).

Local installation can be accomplished through a variety of methods, but [Docker](https://docs.couchbase.com/server/current/install/getting-started-docker.html) is the simplest.

After Couchbase is installed, set up a cluster by following [this tutorial](https://docs.couchbase.com/server/current/manage/manage-nodes/create-cluster.html).

- _NOTE:_ the **eventing** and **analytics** services can be unchecked if memory is a constraint (this is often the case with docker and other local installations).

A variety of sample buckets can be installed to get up and running with a data model quickly.

### Set up environment variables

Copy the `env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set each variable on `.env.local`:

- `COUCHBASE_USERNAME` - The username of an authorized user on your Couchbase instance
- `COUCHBASE_PASSWORD` - The corresponding password for the username specified above
- `COUCHBASE_ENDPOINT` - The endpoint to connect to. Use `localhost` for a local instance of Couchbase, or the Wide Area Network address for a cloud instance.
- `COUCHBASE_BUCKET` - The bucket you'd like to connect to for testing.
- `IS_CLOUD_INSTANCE` - `true` if you are trying to connect to an instance of Couchbase Cloud, `false` otherwise.

### Run Next.js in development mode

```bash
npm install
npm run dev
# or
yarn install
yarn dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

You will either see a message stating "You are connected to Couchbase" or "You are NOT connected to Couchbase". Ensure that you have provided the correct environment variables.

When you are successfully connected, you can refer to the [Couchbase Node.js SDK docs](https://docs.couchbase.com/nodejs-sdk/current/hello-world/start-using-sdk.html) for further instructions on how to query your database.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

## Notes

- When you import your project on Vercel, make sure to click on **Environment Variables** and set the keys to match your `.env.local` file.

- For a cloud deployment on Vercel, the **Environment Variables** values will need to **correspond to a cloud instance of Couchbase** (localhost will **NOT** connect from a remote server such as Vercel). Find info on [getting started with Couchbase cloud](https://developer.couchbase.com/tutorial-cloud-getting-started/).

  - _Important:_ you will have to allowlist 0.0.0.0/0 as the IP address, since Vercel's serverless deployments use [dynamic IP addresses](https://vercel.com/docs/solutions/databases#allowing-&-blocking-ip-addresses)
