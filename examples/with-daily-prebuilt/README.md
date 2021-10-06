# with-daily-prebuilt

This example shows how to embed [Daily Prebuilt](https://www.daily.co/prebuilt?utm_source=github&utm_campaign=next-example-prebuilt), a ready-to-use video chat interface built on [daily-js](https://github.com/daily-co/daily-js?utm_source=github&utm_campaign=next-example-prebuilt), into a Next.js app.

![Screen displays prompt to create room and start call after click displays video call](/public/demo.gif)

## Live demo

Preview the deployed example at: [https://with-daily-prebuilt.vercel.app/](https://with-daily-prebuilt.vercel.app/?utm_source=github&utm_campaign=next-example-prebuilt)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-daily-prebuilt&project-name=with-daily-prebuilt&repository-name=with-daily-prebuilt)

## How to use

1. **Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app)** with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-daily-prebuilt with-daily-prebuilt-app
# or
yarn create next-app --example with-daily-prebuilt with-daily-prebuilt-app
```

2. **Create a Daily account**.Sign up for a free [Daily account](https://dashboard.daily.co/signup?utm_source=github&utm_campaign=next-example-prebuilt) if you don't have one already. There are [options to upgrade](https://www.daily.co/pricing?utm_source=github&utm_campaign=next-example-prebuilt) depending on your needs, but the free tier is plenty for testing out this demo.

3. **Configure .env variables.** Create an `.env` based on [`.env.example`](.env.example). Both `DAILY_DOMAIN` and `DAILY_API_KEY` can be found in the [Daily dashboard](https://dashboard.daily.co/?utm_source=github&utm_campaign=next-example-prebuilt).

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
