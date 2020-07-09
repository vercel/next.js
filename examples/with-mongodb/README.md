## Example app using MongoDB

[MongoDB](https://mongodb.com/atlas) is a general purpose, document-based, distributed database built for modern application developers and for the cloud era. This example will show you how to connect to and use MongoDB as your backend for your Next.js app.

## Demo

## Deploy your own

Once you have access to the environment variables you'll need, deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?c=1&s=https://github.com/vercel/next.js/tree/canary/examples/with-mongodb&env=MONGODB_URI,MONGODB_DB&envDescription=Required%20to%20connect%20the%20app%20with%20MongoDB)

## How to use

Using `create-next-app`

Execute `create-next-app` with npm or Yarn to bootstrap the example:

```bash
npx create-next-app --example with-mongodb with-mongodb
# or
yarn create next-app --example with-mongodb with-mongodb
```

## Configuration

### Set up a MongoDB database

Set up a MongoDB database either locally or with [MongoDB Atlas for free](https://mongodb.com/atlas).

### Set up environment variables

Copy the `env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set each variable on `.env.local`:

- `MONGODB_URI` - Your MongoDB connection string. If you are using [MongoDB Atlas](https://mongodb.com/atlas) you can find this by clicking the "Connect" button for your cluster.
- `MONGODB_DB` - The name of the database you want to use.

### Start Up Development Server

Navigate to your project directory and run either:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Navigate to [http://localhost:3000/api/hello](http://localhost:3000/api/hello) to test if your connection to MongoDB was successful. If it was you should see a response that looks like this:

```json
{
  "ns": "test.test",
  "size": 0,
  "count": 0,
  "storageSize": 0,
  "nindexes": 0,
  "totalIndexSize": 0,
  "indexDetails": {},
  "indexSizes": {},
  "scaleFactor": 1,
  "ok": 1,
  "$clusterTime": {
    "clusterTime": "6847589513905045623",
    "signature": {
      "hash": "fgIxihPon+Kg7i2a36XDddx3OOo=",
      "keyId": "6830955492114694147"
    }
  },
  "operationTime": "6847589513905045623"
}
```

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/import?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [MongoDB Atlas](https://mongodb.com/atlas)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
