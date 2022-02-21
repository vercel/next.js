# Create a Static Blog Site Using Next.js and Contentstack

This example demonstrates how you can set up and run a server side example using Next.js and Contentstack with minimal steps. [SSR](https://nextjs.org/docs/basic-features/pages) and [Contentstack-CMS](https://www.contentstack.com/) as the data source.

## Demo

[https://cms-contentstack-starter](https://cms-contentstack-starter.vercel.app/)

## Deploy on Your Own

Once you have access to [the required environment variables](#step-4-set-up-environment-variables), deploy the sample app using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcontentstack%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-contentstack&env=CONTENTSTACK_API_KEY,CONTENTSTACK_DELIVERY_TOKEN,CONTENTSTACK_ENVIRONMENT,CONTENTSTACK_MANAGEMENT_TOKEN,CONTENTSTACK_API_HOST,CONTENTSTACK_APP_HOST,CONTENTSTACK_LIVE_PREVIEW&envDescription=For%20more%20info%20on%20env%20config&envLink=https%3A%2F%2Fwww.contentstack.com%2Fdocs%2Fdevelopers%2Fsample-apps%2Fbuild-a-starter-website-using-next-js-and-contentstack%23build-and-configure-the-website)

## Steps for Execution

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the app:

```bash

npx create-next-app --example cms-contentstack cms-contentstack-app

# or

yarn create next-app --example cms-contentstack cms-contentstack-app
```

## Configuration

### Prerequisites

- Contentstack Account
- Node.js version 12 or later (recommended 14)
- Contentstack CLI: npm install -g @contentstack/cli
- Enable Live Preview (https://www.contentstack.com/docs/content-managers/live-preview/) for your organization
- Management token (https://www.contentstack.com/docs/developers/create-tokens/generate-a-management-token/) with read permission only

### Step 1. Login to Contentstack CLI

#### Step A Set Login Region

By default, the CLI uses the North American endpoint. To use the European endpoint, run the following command in your terminal (command prompt).

`csdx config:set:region EU`

> Note: For NA region, you can skip [step A].

#### Step B Login in to Contentstack CLI

After setting the region, login in to Contentstack CLI by running the following command:

`csdx auth:login`

### Step 2. Import Stack for Starter Apps

Now, import the stack for starter apps using the seed command. The seed command helps you to easily import and create a stack.
To start building the starter app, run the following command in your terminal and then follow the on-screen instructions that creates the stack with the required content types, entries and assets.

`csdx cm:seed -r "contentstack/stack-starter-app"`

### Step 3. Create Delivery and Management token

After importing the stack, navigate to the tokens section in your stack’s Settings/tokens. Create the delivery token and for the live preview feature support, create a new management token.

> Note: We need the management token with READ only access. We recommend you to copy and save the management token as it is visible only once.

### Step 4. Configure the Starter App

Copy the `.env.local.example` file from your root directory to `.env.local` (which is ignored by Git): or use the following command.

```bash
cp .env.local.example .env.local
```

Then, set each variable on `.env.local` as follows:

- `CONTENTSTACK_API_KEY` is your Stack API key.
- `CONTENTSTACK_DELIVERY_TOKEN` is the publishing environment delivery token from step 3.

- `CONTENTSTACK_ENVIRONMENT` is the name of your published environment for the delivery token.

- `CONTENTSTACK_MANAGEMENT_TOKEN` is the stack management token generated in step 3.

- `CONTENTSTACK_API_HOST` is the api host URL.
  For the NA region use `api.contentstack.io` and for the EU region use `eu-app.contentstack.com`.

- `CONTENTSTACK_APP_HOST` is the app host URL of your stack
  For the NA region use `app.contentstack.com` and for the EU region you can use ‘eu-app.contentstack.com’.

- `CONTENTSTACK_LIVE_PREVIEW` is to enable and disable live preview from starter apps. For live preview features, always set this value to true.

Your `.env.local` file should look like this:

```bash
CONTENTSTACK_API_KEY= blt12…
CONTENTSTACK_DELIVERY_TOKEN=cs123…
CONTENTSTACK_ENVIRONMENT=production

## For live preview
CONTENTSTACK_MANAGEMENT_TOKEN= cs123…
CONTENTSTACK_API_HOST=api.contentstack.io
CONTENTSTACK_APP_HOST=app.contentstack.com
CONTENTSTACK_LIVE_PREVIEW=true

```

### Step 5. Run Next.js in the Development Mode

```bash
npm install
npm run dev
# or
yarn install
yarn dev
```

### Step 6. Try the Preview Mode

You can deploy this sample app to the cloud with [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Deploy your Locally Installed Project

To deploy your locally installed project on Vercel, push it to GitHub/ GitLab/ Bitbucket and then [import to Vercel](https://vercel.com/import/git?utm_source=github&utm_medium=readme&utm_campaign=next-example).

**Important**: While importing your project on Vercel, make sure to click on **Environment Variables** and set them to match your `.env.local` file.

## Deploy Using our Template

Alternatively, you can deploy the sample app by using our template. To do this, click on the Deploy button given below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcontentstack%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fcms-contentstack&env=CONTENTSTACK_API_KEY,CONTENTSTACK_DELIVERY_TOKEN,CONTENTSTACK_ENVIRONMENT,CONTENTSTACK_MANAGEMENT_TOKEN,CONTENTSTACK_API_HOST,CONTENTSTACK_APP_HOST,CONTENTSTACK_LIVE_PREVIEW&envDescription=For%20more%20info%20on%20env%20config&envLink=https%3A%2F%2Fwww.contentstack.com%2Fdocs%2Fdevelopers%2Fsample-apps%2Fbuild-a-starter-website-using-next-js-and-contentstack%23build-and-configure-the-website)
