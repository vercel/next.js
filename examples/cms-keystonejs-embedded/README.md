# Embedded KeystoneJS Example

A Static Blog starter project powered by [KeystoneJS](https://keystonejs.com):

- Powerful Admin UI for creating & editing content in dev mode
- Statically built pages for fast production sites
- Client-side access to data via auto-generated GraphQL API

## Deploy on Vercel

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-keystonejs-embedded&project-name=cms-keystonejs-embedded&repository-name=cms-keystonejs-embedded)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-keystonejs-embedded cms-keystonejs-embedded
# or
yarn create next-app --example cms-keystonejs-embedded cms-keystonejs-embedded
```

Next, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the Next.js site, and [http://localhost:8000](http://localhost:8000) to see the KeystoneJS Admin UI.

Make changes in the KeystoneJS Admin UI, then reload the Next.js site to see what it looks like!

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## KeystoneJS

[KeystoneJS](https://keystonejs.com) is the best headless content management system around, especially when you're using a component-based front-end like React and Vue. In addition to auto-generating a GraphQL API and providing a powerful Admin UI, KeystoneJS is backed by Prisma, so can work with a range of different databases.

This example uses a local SQLite database (a `.db` file) to store data. In development mode, the KeystoneJS Admin UI will save data to the local SQLite database file, and in production the KeystoneJS GraphQL & node APIs will read data from it.

NOTE: The local SQLite database must be deployed along with the rest of the code in this example. Usually this means committing it to source control. Due to this reason, it is not recommended to store any private data using this example repo.

For more details, see [How to embed Keystone + SQLite in a Next.js app](https://next.keystonejs.com/tutorials/embedded-mode-with-sqlite-nextjs)

## The code

The key files for this project

```
.
├─ app.db             # The SQLite database. Commit this with your changes
├─ keystone.ts        # Configure Keystone's data model & other options
└─ pages
   ├─ api
   │  └─ graphql.tsx  # Access your data via a GraphQL API
   └─ post
      └─ [slug].tsx   # Statically generate pages based on your data
```

## Learn More

To learn more about KeystoneJS, take a look at the following resources:

- [KeystoneJS Documentation](https://keystonejs.com) - learn about KeystoneJS features and API.
- [How to embed Keystone + SQLite in a Next.js app](https://next.keystonejs.com/tutorials/embedded-mode-with-sqlite-nextjs) - the tutorial which inspired this example

You can check out [the KeystoneJS GitHub repository](https://github.com/keystonejs/keystone) - your feedback and contributions are welcome!
