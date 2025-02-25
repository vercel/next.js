# Full-stack EdgeDB + Next.js application

A simple blog application built with Next.js, TypeScript, [React](https://reactjs.org/), and [EdgeDB](https://www.edgedb.com/docs) on the backend.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-edgedb)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-edgedb&project-name=with-edgedb&repository-name=with-edgedb&env=EDGEDB_DSN)

## How to use

### Download the example project

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-edgedb with-edgedb-app
```

```bash
yarn create next-app --example with-edgedb with-edgedb-app
```

```bash
pnpm create next-app --example with-edgedb with-edgedb-app
```

Then `cd` into the created directory.

```bash
$ cd with-edgedb-app
```

### Install the CLI

First install the EdgeDB CLI if you haven't already.

```bash
# macOS/Linux
$ curl --proto '=https' --tlsv1.2 -sSf https://sh.edgedb.com | sh

# Windows (Powershell)
$ iwr https://ps1.edgedb.com -useb | iex
```

### Initialize the EdgeDB project

Initialize the project with the following CLI command:

```bash
$ edgedb project init
```

After you follow the prompts, this command will spin up a local EdgeDB instance and apply all the migrations inside `dbschema/migrations`. Now that the project is initialized, all EdgeDB clients initialized inside the project directory will connect to this instance automatically—no need for environment variables or hard-coded configuration. ([Read more about projects here.](https://www.edgedb.com/docs/guides/projects))

### Install dependencies

Install npm dependencies:

```bash
$  npm install
# or
$  yarn
```

### Generate the query builder

This project uses the EdgeQL query builder for TypeScript. This tool can express any EdgeQL query in a code-first way and infers a static return type. Generate it with the following command:

```bash
$ npx edgeql-js
```

The query builder consists of several files that are generated into the `dbschema/edgeql-js` directory. Import it like so:

```ts
import e from "./dbschema/edgeql-js";
```

### Seed the database

```bash
$ npx ts-node seed.ts
```

### Start the app

```bash
$ yarn dev
```

The application should now be running on http://localhost:3000.

## Notes

#### packages structure

- `/`: See all published posts
- `/drafts`: See all drafts
- `/create`: Form to create new draft
- `/blog/:id`: See either an edit page or a published post, depending on the publish status of the post.

#### API structure

- `POST /api/post`: Create a new post
  - Body: `{title: string; content: string; authorName: string}`
- `PATCH /api/post/:id`: Update a post by `id`
  - Body: `{title?: string; content?: string;}`
- `PUT /api/publish/:id`: Publish a post by `id`
- `DELETE /api/post/:id`: Delete a post by `id`

## Evolving the app

Evolving the application typically requires three steps:

1. Update the schema in `dbschema/default.esdl`
2. Generate a new migration with `edgedb migration create`
3. Apply the migration with `edgedb migrate`
4. Regenerate the query builder with `npx edgeql-js`
5. Update the application code, as needed.

## Deployment

To deploy this application, deploy EdgeDB to your preferred cloud provider:

- [AWS](https://www.edgedb.com/docs/guides/deployment/aws_aurora_ecs)
- [Google Cloud](https://www.edgedb.com/docs/guides/deployment/gcp)
- [Azure](https://www.edgedb.com/docs/guides/deployment/azure_flexibleserver)
- [DigitalOcean](https://www.edgedb.com/docs/guides/deployment/digitalocean)
- [Fly.io](https://www.edgedb.com/docs/guides/deployment/fly_io)
- [Docker](https://www.edgedb.com/docs/guides/deployment/docker) (cloud-agnostic)

Then:

1. Find your instance's DSN (AKA connection string). The exact instructions for this depend on which cloud you are deploying to.

2. Use this DSN to migrate your remote instance to the latest schema. Run this command from inside your project directory.

```
edgedb migrate --dsn <your-instance-dsn> --tls-security insecure
```

You have to disable TLS checks with `--tls-security insecure`. All EdgeDB instances use TLS by default, but configuring it is out of scope of this project.

3. Deploy this app to Vercel with the button above. You'll be prompted to provide a value for `EDGEDB_DSN`, the value from the previous step.

4. Open the application at the deployment URL supplied by Vercel.

## Next steps

- Check out the [EdgeDB docs](https://www.edgedb.com/docs)
- Join the EdgeDB [Discord server](https://edgedb.com/p/discord)
- Check out the code on [GitHub](https://github.com/edgedb/edgedb)
