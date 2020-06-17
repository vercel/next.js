# Mongoose example

> [**Mongoose**](https://mongoosejs.com/) provides a straight-forward, schema-based solution to model your application data. It includes built-in type casting, validation, query building, business logic hooks and more, out of the box.

**Next.js** v9.3 added a feature called [Static Site Generation (SSG)](https://nextjs.org/blog/next-9-3#next-gen-static-site-generation-ssg-support) that allows to write server code inside `pages`, by example directly connect to DB 😎.

The example is a blog with articles, categories and comments but not includes authentication.

## Configuration

You need access to a running MongoDB instance, you can either:

- Install [locally](https://lmgtfy.com/?q=run+mongodb+locally&s=d) (Install instructions are far from the scope of this example)
- Run with Docker and Docker Compose,
- Or [in the cloud](https://vercel.com/guides/deploying-a-mongodb-powered-api-with-node-and-vercel).

The connection string is set with an environmental variable called `MONGODB_URL`, see [libs/db.js](./libs/db.js#L20)

```bash
cp .env.example .env
# Edit .env file and set the connection string
```

### Using `docker-compose`

For development purpose it would be a good idea to use Docker to run MongoDB, this example includes a [docker-compose.yml](./docker-compose.yml)

```bash
docker-compose up -d
cp .env.example .env
```

## Load example data

The example includes some example data or A.K.A. fixtures

```bash
npm run fixtures:load
# or
yarn fixtures:load
```

## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-mongoose)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-mongoose with-mongoose-app
# or
yarn create next-app --example with-mongoose with-mongoose-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mongoose
cd with-mongoose
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
