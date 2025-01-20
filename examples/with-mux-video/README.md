# Mux Video

This example uses Mux Video, an API-first platform for video. The example features video uploading and playback in a Next.js application.

## Try it out

- [https://with-mux-video.vercel.app/](https://with-mux-video.vercel.app/)
- This project was used to create [stream.new](https://stream.new/)

## Deploy your own

### New to Mux

If you do not already have a Mux account, the easiest way to get started with Mux is through the native integration in the [Vercel Marketplace](https://vercel.com/marketplace/mux). Vercel Marketplace users will get $20 of usage/month for $0. [Learn more](https://vercel.com/marketplace/mux).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-mux-video&project-name=with-mux-video&repository-name=with-mux-video&products=[{"type":"integration","productSlug":"mux","integrationSlug":"mux","protocol":"video"}])

### Existing Mux user

If you have an existing Mux account, you can still deploy easily with [Vercel](https://vercel.com/home):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-mux-video&project-name=with-mux-video&repository-name=with-mux-video)

Once deployed, continue with step 3 below.

## How to use

If you deployed with the native Mux integration, you're all set! However, if you have your own Mux account already, or want to set up things manually, you can follow the following steps.

### Step 1. Create your Mux account

The easiest way to get started with Mux is through the native integration in the [Vercel Marketplace](https://vercel.com/marketplace/mux). Vercel Marketplace users will get $20 of usage/month for $0. [Learn more](https://vercel.com/marketplace/mux).

You can also get started by creating an account directly in [Mux](https://www.mux.com/?utm_source=create-next-app&utm_medium=with-mux-video&utm_campaign=create-next-app).

### Step 2. Create a Next app with this example

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example with-mux-video with-mux-video-app
```

```bash
yarn create next-app --example with-mux-video with-mux-video-app
```

```bash
pnpm create next-app --example with-mux-video with-mux-video-app
```

```bash
bunx create-next-app --example with-mux-video with-mux-video-app
```

### Step 3. Set up environment variables

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Then, go to the [settings page](https://dashboard.mux.com/settings/access-tokens) in your Mux dashboard, get a new **API Access Token**. Use that token to set the variables in `.env.local`:

- `MUX_TOKEN_ID` should be the `TOKEN ID` of your new token
- `MUX_TOKEN_SECRET` should be `TOKEN SECRET`

At this point, you're good to `npm run dev` or `yarn dev` or `pnpm dev`. However, if you want to deploy, read on:

### Step 4. Deploy on Vercel

You can deploy this app to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

To deploy on Vercel, you need to set the `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` environment variables using either the [Vercel Dashboard](https://vercel.com/docs/projects/environment-variables/managing-environment-variables?utm_source=github&utm_medium=readme&utm_campaign=next-example) or the [Vercel CLI](https://vercel.com/docs/cli/env?utm_source=github&utm_medium=readme&utm_campaign=next-example)

Then push the project to GitHub/GitLab/Bitbucket and [import to Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) to deploy.

## Notes

### Preparing for Production

**Important:** When creating uploads, this demo sets `cors_origin: "*"` in the [`app/(upload)/page.tsx`](<app/(upload)/page.tsx>) file. For extra security, you should update this value to be something like `cors_origin: 'https://your-app.com'`, to restrict uploads to only be allowed from your application.

### How it works

1. Users land on the home page, `app/(upload)/page.tsx`. The Mux [Direct Uploads API](https://docs.mux.com/api-reference#video/tag/direct-uploads?utm_source=create-next-app&utm_medium=with-mux-video&utm_campaign=create-next-app) provides an endpoint to [Mux Uploader React](https://docs.mux.com/guides/mux-uploader?utm_source=create-next-app&utm_medium=with-mux-video&utm_campaign=create-next-app).
1. The user uploads a video with Mux Uploader. When their upload is complete, Mux Uploader calls a [server action](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) that redirects to...
1. `app/(upload)/asset/[assetId]/page.tsx`, which polls the [Asset API](https://docs.mux.com/api-reference#video/tag/assets?utm_source=create-next-app&utm_medium=with-mux-video&utm_campaign=create-next-app) via server action, waiting for the asset to be ready. Once the asset is ready, it redirects to...
1. `app/v/[assetId]/page.tsx`, where users can watch their video using [Mux Player React](https://docs.mux.com/guides/mux-player-web?utm_source=create-next-app&utm_medium=with-mux-video&utm_campaign=create-next-app). This page uses the [Mux Image API](https://docs.mux.com/guides/get-images-from-a-video) and the [Next.js Metadata API](https://nextjs.org/docs/app/building-your-application/optimizing/metadata) to provide an og images tailored to each video.
