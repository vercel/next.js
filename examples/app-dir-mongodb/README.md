# MongoDb Driver with App dir

implementation of using MongoDb driver with Next Js App Router.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example app-dir-mongodb app-dir-mongodb-app
```

```bash
yarn create next-app --example app-dir-mongodb app-dir-mongodb-app
```

```bash
pnpm create next-app --example app-dir-mongodb app-dir-mongodb-app
```

```bash
bunx create-next-app --example app-dir-mongodb app-dir-mongodb-app
```

## Configuration

### Set up a MongoDB database

Set up a MongoDB database either locally or with [MongoDB Atlas for free](https://mongodb.com/atlas).

### Set up environment variables

Set variable on `.env.local`:

- `MONGO_URL` - Your MongoDB connection string. If you are using [MongoDB Atlas](https://mongodb.com/atlas) you can find this by clicking the "Connect" button for your cluster.

## Deploy on Vercel

MAKE SURE MONGODB ATLAS CONNECTION ACCEPTS ALL ADDRESSES BY SETTING TO 0.0.0.0 IN THE ATLAS CONFIGURATION SECTION.

## Example Production

my [repo](https://github.com/lynxx007/game-glare)
Deployed on [Vercel](https://game-glare.vercel.app/)



Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).