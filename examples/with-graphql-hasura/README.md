# A statically generated blog example using Next.js and Hasura

This example showcases Next.js's [Static Generation](https://nextjs.org/docs/basic-features/pages) feature using [Hasura](https://hasura.io/) as the data source.

## Demo

[https://next-blog-hasura.now.sh/](https://next-blog-hasura.now.sh/)

### Related examples

- [WordPress](/examples/cms-wordpress)
- [DatoCMS](/examples/cms-datocms)
- [Sanity](/examples/cms-sanity)
- [TakeShape](/examples/cms-takeshape)
- [Prismic](/examples/cms-prismic)
- [Contentful](/examples/cms-contentful)
- [Agility CMS](/examples/cms-agilitycms)
- [Cosmic](/examples/cms-cosmic)
- [ButterCMS](/examples/cms-buttercms)
- [Storyblok](/examples/cms-storyblok)
- [Strapi](/examples/cms-strapi)
- [Blog Starter](/examples/blog-starter)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-graphql-hasura with-graphql-hasura
# or
yarn create next-app --example with-graphql-hasura with-graphql-hasura
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-graphql-hasura
cd with-graphql-hasura
```

## Configuration

### Step 1. Start Hasura Locally

```bash
cd hasura
```

```bash
docker-compose up -d
```

Check if the containers are running using `docker ps` command.

Head to http://localhost:8080/console to open the Hasura console.

### Step 2. Apply Database Migrations

Now that Hasura is running, let's create the database schema for this blog example by applying the migrations.

[Install the Hasura CLI](https://hasura.io/docs/1.0/graphql/manual/hasura-cli/install-hasura-cli.html#install-hasura-cli) for your OS.

Now in your terminal,

```bash
hasura migrate apply
```
This will apply the schema to Postgres, creating tables and populates sample data.

### Step 3. Apply Metadata

We will have to apply metadata to ensure Hasura is tracking the tables required to generate the APIs and sets the right permission rules for accessing the tables.

```bash
hasura metadata apply
```

### Step 4. Set up environment variables

Let's enable admin secret for the Hasura instance.

Open the `docker-compose.yaml` file and uncomment the `HASURA_GRAPHQL_ADMIN_SECRET` line to enable it.

Then in your terminal, execute the following

```bash
docker-compose up -d
```

Open a new terminal and `cd` into the Next.js app directory you created earlier.

```
cd with-graphql-hasura
```

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set each variable on `.env.local`:

- `HASURA_GRAPHQL_ENDPOINT` should be set to the GraphQL endpoint exposed by Hasura, typically at `http://<host>/v1/graphql`. In our case, host will be `localhost:8080`.
- `HASURA_GRAPHQL_ADMIN_SECRET` should be set to the ADMIN SECRET set for the Hasura instance.

### Step 5. Run Next.js in development mode

Inside the Next.js app directory, run:

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your blog should be up and running on [http://localhost:3000](http://localhost:3000)! You should see two posts that were part of the initial database migration.

### Step 6. Try preview mode

To try preview mode, we have a blog post with the `draft` status.

Now, if you go to the post page on localhost for such posts, you won't see them because it’s not published. However, if you use the **Preview Mode**, you'll be able to see the change ([Documentation](https://nextjs.org/docs/advanced-features/preview-mode)).

To enable the Preview Mode, go to this URL:

```
http://localhost:3000/api/preview?secret=<secret>&slug=preview-mode-for-static-generation
```

- `<secret>` should be the string you entered for `HASURA_GRAPHQL_ADMIN_SECRET`.
- `<slug>` should be the post's `slug` attribute.

We already have a post with slug `preview-mode-for-static-generation` in draft status that can be used to test this out.

You should now be able to see the draft post. To exit the preview mode, you can click **Click here to exit preview mode** at the top.

### Step 7. Deploy Hasura

To deploy to production, you must first deploy Hasura on a public URL. The Hasura backend for our demo at https://next-blog-hasura.now.sh/ is deployed to Heroku ([here’s the documentation](https://hasura.io/docs/1.0/graphql/manual/getting-started/heroku-simple.html)). 

After setting up Hasura on Heroku, copy the Heroku app URL to apply the migrations

```bash
hasura migrate apply --endpoint https://hasura-blog-backend.herokuapp.com
```

```bash
hasura metadata apply --endpoint https://hasura-blog-backend.herokuapp.com
```

Replace `hasura-blog-backend` with your own Heroku app name.

Now enable the `HASURA_GRAPHQL_ADMIN_SECRET` env on Heroku to protect the instance.

### Step 8. Deploy on Vercel

After deploying Hasura, you can deploy this Next.js app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variables with **Vercel Secrets** using [Vercel CLI](https://vercel.com/download) ([Documentation](https://vercel.com/docs/vercel-cli#commands/secrets)).

Install [Vercel CLI](https://vercel.com/download), log in to your account from the CLI, and run the following commands to add the environment variables. Replace `<HASURA_GRAPHQL_ENDPOINT>` and `<HASURA_GRAPHQL_ADMIN_SECRET>` with the corresponding strings in `.env`.

```
vercel secrets add hasura_graphql_endpoint <HASURA_GRAPHQL_ENDPOINT>
vercel secrets add hasura_graphql_admin_secret <HASURA_GRAPHQL_ADMIN_SECRET>
```

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.
