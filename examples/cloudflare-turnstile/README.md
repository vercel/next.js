# Example with Cloudflare Turnstile

[Turnstile](https://developers.cloudflare.com/turnstile/) is Cloudflare’s smart CAPTCHA alternative. It can be embedded into any website without sending traffic through Cloudflare and works without showing visitors a CAPTCHA.

This example shows how you can use **Cloudflare Turnstile** with your Next.js project. You can see a [live version here](https://with-cloudflare-turnstile.vercel.app/).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cloudflare-turnstile&project-name=cloudflare-turnstile&repository-name=cloudflare-turnstile)

**Important**: When you import your project on Vercel, make sure to click on **Environment Variable**s and set them to match your .env.local file.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example cloudflare-turnstile cloudflare-turnstile-app
```

```bash
yarn create next-app --example cloudflare-turnstile cloudflare-turnstile-app
```

```bash
pnpm create next-app --example cloudflare-turnstile cloudflare-turnstile-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Configuring Cloudflare Turnstile

### Get a sitekey and secret key

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile) and select your account.
2. Go to Turnstile.
3. Select Add a site and fill out the form.
4. Copy your **Site Key** and **Secret Key**.

### Set up environment variables

To connect the app with Cloudflare Turnstile, you'll need to add the settings from your Cloudflare dashboard as environment variables

Copy the .env.local.example file in this directory to .env.local.

```bash
cp .env.local.example .env.local
```

Then, open .env.local and fill these environment variables:

- `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`
- `CLOUDFLARE_TURNSTILE_SECRET_KEY`
