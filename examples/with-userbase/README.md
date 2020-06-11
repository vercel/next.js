# Userbase Example

This is an example of using [Userbase](https://userbase.com) in a Next.js project.

Deployed Demo: [https://next-userbase.now.sh](https://next-userbase.now.sh)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/git?s=https://github.com/vercel/next.js/tree/canary/examples/with-userbase&env=NEXT_PUBLIC_USERBASE_APP_ID&envDescription=encodeURI(The Userbase app ID, found in the Userbase dashboard.&envLink=https://v1.userbase.com/#))

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-userbase next-userbase-app
# or
yarn create next-app --example with-userbase next-userbase-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-userbase
cd with-userbase
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## Configuration

### Step 1. Create an account on Userbase

First, [create an account on Userbase](https://userbase.com).

After creating an account, make note of your _App ID_ which you'll be needing later.

### Step 2. Setting up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then set the variable on `.env.local`:

- `NEXT_PUBLIC_USERBASE_APP_ID` should be the _App ID_ from when you created your Userbase account.

Your `.env.local` file should look like this:

```bash
NEXT_PUBLIC_USERBASE_APP_ID=...
```

### Step 3. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Your todo app should be up and running on [http://localhost:3000](http://localhost:3000)! If it doesn't work, post on [GitHub discussions](https://github.com/vercel/next.js/discussions).

### Step 4. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the environment variable using the [Vercel dashboard](https://vercel.com/dashboard) ([Documentation](https://vercel.com/docs/v2/build-step#environment-variables)).

You can do this when importing your project by selecting the environment variables dropdown, and using a name of `NEXT_PUBLIC_USERBASE_APP_ID` with the [Userbase app ID](https://v1.userbase.com/#) as the value.
