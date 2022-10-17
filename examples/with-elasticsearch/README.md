## Example app using Elasticsearch

[Elasticsearch](https://www.elastic.co/elasticsearch) is a distributed, RESTful search and analytics engine. As the heart of the Elastic Stack, it centrally stores your data for lightning fast search, fine‑tuned relevancy, and powerful analytics that scale with ease. This example will show you how to connect to and use Elasticsearch as your search backend for your Next.js app.

If you want to learn more about Elasticsearch, visit the following pages:

- [Elastic Stack](https://www.elastic.co/products)
- [Elastic Documentation](https://elastic.co/docs)

## Deploy your own

Once you have access to the environment variables you'll need, deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-elasticsearch&project-name=with-elasticsearch&repository-name=with-elasticsearch&env=ESS_CLOUD_ID,ESS_CLOUD_USERNAME,ESS_CLOUD_PASSWORD&envDescription=Required%20to%20connect%20the%20app%20with%Elasticsearch)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-elasticsearch with-elasticsearch-app
```

```bash
yarn create next-app --example with-elasticsearch with-elasticsearch-app
```

```bash
pnpm create next-app --example with-elasticsearch with-elasticsearch-app
```

## Configuration

### Set up Elasticsearch

Set up a Elasticsearch either locally or with [Elastic Cloud for free](https://elastic.co/cloud).

### Set up environment variables

Copy the `env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set each variable on `.env.local`:

- `ESS_CLOUD_ID` - URL for the Elasticsearch instance, if you are using [Elastic Cloud](https://elastic.co/cloud) you can find this in the Elastic Cloud console.
- `ESS_CLOUD_USERNAME` - The username for the Elasticsearch instance you have created, if you are using default user it would be `elastic`.
- `ESS_CLOUD_PASSWORD` - Password for the Elasticsearch instance

### Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

Please ensure that you have configured the env variables in the `.env.local`, if not you will see the message "You are not connected to Elasticsearch!" in the main page.

If you see that you are connected, you can refer to the [Elasticsearch NodeJS language client docs](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html) for further instructions on querying Elasticsearch.

## Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

#### Deploy Your Local Project

To deploy your local project to Vercel, push it to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: When you import your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

#### Deploy from Our Template

Alternatively, you can deploy using our template by clicking on the Deploy button below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-elasticsearch&project-name=with-elasticsearch&repository-name=with-elasticsearch&env=ESS_CLOUD_ID,ESS_CLOUD_USERNAME,ESS_CLOUD_PASSWORD&envDescription=Required%20to%20connect%20the%20app%20with%20Elasticsearch)
