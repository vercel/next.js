# Mongoose example

> [**Mongoose**](https://mongoosejs.com/) provides a straight-forward, schema-based solution to model your application data. It includes built-in type casting, validation, query building, business logic hooks and more, out of the box.

**Next.js** v9.3 add a feature called [Static Site Generation (SSG)](https://nextjs.org/blog/next-9-3#next-gen-static-site-generation-ssg-support) that allows to write server code in `pages`, by example directly connect to DB 😎.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-mongoose-connection)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-mongoose-connection with-mongoose-connection-app
# or
yarn create next-app --example with-mongoose-connection with-mongoose-connection-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mongoose-connection
cd with-mongoose-connection
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
