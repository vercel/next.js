## Example app using Facebook Pixel

This example shows how to use Next.js along with Facebook Pixel. A custom `_app.js` is used to track route changes and send pageviews to facebook pixel. This example uses [react-facebook-pixel](https://www.npmjs.com/package/react-facebook-pixel).

You will need to set your `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` environment variable for it to send events to your facebook app. When not specified, tracking is disabled.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-facebook-pixel)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-facebook-pixel with-facebook-pixel-app
# or
yarn create next-app --example with-facebook-pixel with-facebook-pixel-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
