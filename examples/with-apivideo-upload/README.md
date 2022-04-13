# api.video video uploader

This video uploader and playback app is built with Next.js and api.video, the video first API.

## Demo

[https://apivideo-uploader.vercel.app/](https://apivideo-uploader.vercel.app/)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-apivideo-upload&project-name=with-apivideo-upload&repository-name=with-apivideo-upload)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-apivideo-upload with-apivideo-upload-app
# or
yarn create next-app --example with-apivideo-upload with-apivideo-upload-app
# or
pnpm create next-app -- --example with-apivideo-upload with-apivideo-upload-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Getting started

### 1. Create an api.video free account

Go to [dashboard.api.video](https://dashboard.api.video/), log in or create a free account.
You can choose to stay in sandbox and have watermark over your videos, or enter in [production mode](https://api.video/pricing) and take advantage of all the features without limitations.

### 2. Get you API key

Once in the dashboard, find your API keys directly in the `/overview` or navigate to `/apikeys` with the "API Keys" button in the side navigation.
Copy your API key and paste it in `.env.development` as value for `API_KEY`.
You can now try the application locally by running `npm run dev` from the root directory.

### 3. Deployment

First, push your app to GitHub/GitLab or Bitbucket
The, go to [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) and import your new repository.
Add an environment variable with name `API_KEY` and your API key for value.
Click on deploy 🎉
