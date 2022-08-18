# api.video video uploader

This video uploader and playback app is built with Next.js and api.video, the video first API.

## Demo

[https://with-apivideo.vercel.app/videos](https://with-apivideo.vercel.app/videos)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-apivideo&project-name=with-apivideo&repository-name=with-apivideo)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-apivideo-app
```

```bash
yarn create next-app --example with-apivideo-app
```

```bash
pnpm create next-app --example with-apivideo-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Getting started

### 1. Create an api.video free account

1. Go to [dashboard.api.video](https://dashboard.api.video/), log in or create a free account.
2. You can choose to stay in sandbox and have watermark over your videos, or enter in [production mode](https://api.video/pricing) and take advantage of all the features without limitations.

### 2. Get you API key

1. Once in the dashboard, find your API keys directly in the `/overview` or navigate to `/apikeys` with the "API Keys" button in the side navigation.
2. Copy your API key, and paste it in `.env.local.example` as value for `API_KEY`.
3. Rename `.env.local.example` to `.env.local`.
4. Install the packages by running `npm install`, `yarn install` or `pnpm install`.
5. You can now try the application locally by running `npm run dev`, `yarn dev` or `pnpm dev` from the root directory.

### 3. Deployment

1. First, push your app to GitHub/GitLab or Bitbucket
2. Then, go to [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) and import your new repository.
3. Add an environment variable with name `API_KEY` and your API key for value.
4. Click on deploy 🎉
