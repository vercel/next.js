# Example app with Facebook Chat Plugin

This example shows how to embed the Facebook Chat Plugin in your Nextjs App. First, follow the steps outlined in the [Meta Business Help Center](https://www.facebook.com/business/help/1524587524402327). And the chat plugin code is added in [\_app](/examples/with-facebook-chat-plugin/pages/_app.tsx).

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-facebook-chat-plugin with-facebook-chat-plugin-app
# or
yarn create next-app --example with-facebook-chat-plugin with-facebook-chat-plugin-app
# or
pnpm create next-app -- --example with-facebook-chat-plugin with-facebook-chat-plugin-app
```

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set the `NEXT_PUBLIC_FACEBOOK_PAGE_ID` variable in `.env.local` to match your Facebook page's ID.
