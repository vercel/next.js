## Example app using Google Tag Manager

This example shows how to use Next.js along with Google Tag Manager. [`pages/_document.js`](pages/_document.js) is used to inject [base code](https://developers.google.com/tag-manager/quickstart). [`pages/_app.js`](pages/_app.js) is used to track route changes and send page views to Google Tag Manager.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-google-tag-manager)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-google-tag-manager with-google-tag-manager-app
# or
yarn create next-app --example with-google-tag-manager with-google-tag-manager-app
```

Next, copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git):

```bash
cp .env.local.example .env.local
```

Set the `NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID` variable in `.env.local` to match your Google Tag Manager ID.

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
