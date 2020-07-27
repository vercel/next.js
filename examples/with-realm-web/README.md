# Realm-Web SDK Example

This example uses [Realm-Web SDK](https://docs.mongodb.com/realm/web/) to query a realm graphql endpoint using [swr](https://swr.now.sh/).

This example relies on [MongoDB Realm](https://www.mongodb.com/realm) for its GraphQL backend.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-realm-web)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-realm-web with-realm-web-app
# or
yarn create next-app --example with-realm-web with-realm-web-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-realm-web
cd with-realm-web
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Configuration

To set up your app:

1. Link a cluster that includes the [Atlas sample data sets](https://docs.atlas.mongodb.com/sample-data/)
2. Configure permissions for the `sample_mflix.movies` collection. For this
   demo, you can assign ready only permissions for all authenticated users.
3. Generate a collection schema for the `sample_mflix.movies` collection.
   Add a root-level "title" field to the schema with the value set to "movie".
4. Enable anonymous authentication
5. Once your app is set up, replace the value of NEXT_PUBLIC_REALM_APP_ID in `.env` file with your App ID
