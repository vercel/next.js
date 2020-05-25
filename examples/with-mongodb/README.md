# MongoDB and Next.js Example

This example shows how you can use a MongoDB database to support your Next.js application.

**Pets** is an application that allows users to add their pets' information (e.g., name, owner's name, diet, age, dislikes, likes, and photo). They can also delete it or edit it anytime.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/with-mongodb-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-mongodb with-mongodb-app
# or
yarn create next-app --example with-mongodb with-mongodb-app
```

## Configuration

### Step 1. Connect MongoDB to the application

Please follow the [MongoDB Guides](https://docs.mongodb.com/guides/server/drivers/) on how to connect to MongoDB.

### Step 2. Set up schema models for the application

Based on the types of data needed for your application, you will modify the type definitions in [Pet.js](./models/Pet.js) as well as the seed data in [Pet-sampleSeed.json](./seed/Pet-sampleSeed.json)

### Step 3. Import sample seed data to your MongoDB

Please follow the [Mongodb Guides](https://docs.mongodb.com/guides/server/insert/) on how to insert data to into MongoDB.

### Step 4. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Be sure to update the file with your own MongoDB URI connection string (from step 1) and development url:

Then set each variable on `.env.local`:

- `MONGO_DBURI` should be your MongoDB URI. Check [here](https://docs.mongodb.com/guides/server/drivers/#obtain-your-mongodb-connection-string) on how to obtain your MongoDB connection string.
- `VERCEL_URL` should be your development url (for local development) or your production url (see deploy section for more details).

Your `.env.local` file should look like this:

```bash
MONGO_DBURI=...
VERCEL_URL=...
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-mongodb
cd with-mongodb
```

## Install and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## Deploy on Vercel

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
