# A statically generated landing page with Next.js and Makeswift

This example showcases how you can use [Makeswift](https://www.makeswift.com/) to visually build statically generated pages in Next.js.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/cms-makeswift&project-name=cms-makeswift&repository-name=cms-makeswift)

## Demo

### [https://nextjs-makeswift-example.vercel.app/](https://nextjs-makeswift-example.vercel.app/)

## How to use

1. Download the example:

   Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

   ```bash
   npx create-next-app --example cms-makeswift cms-makeswift-app
   # or
   yarn create next-app --example cms-makeswift cms-makeswift-app
   # or
   pnpm create next-app --example cms-makeswift cms-makeswift-app
   ```

2. Install dependencies:

   ```bash
   yarn install
   # or
   npm install
   # or
   pnpm install
   ```

3. Rename the `.env.local.example` file to `.env.local` and include your Makeswift site's API key:

   ```diff
   -- MAKESWIFT_API_HOST=
   -- MAKESWIFT_SITE_API_KEY=
   ++ MAKESWIFT_API_HOST=https://api.makeswift.com
   ++ MAKESWIFT_SITE_API_KEY=<YOUR_MAKESWIFT_SITE_API_KEY>
   ```

4. Run the local dev script:

   ```bash
   yarn dev
   # or
   npm run dev
   ```

   Your host should be up and running on http://localhost:3000.

5. Finally, go to your Makeswift site settings and add http://localhost:3000/makeswift as the host URL and you're all set!

## Deploy it

When you're ready to go live, deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)). All you'll need to do is update your host inside of Makeswift to your Vercel deployment.

## Next steps

With Makeswift, you can give your marketing team custom building blocks to create high quality Next.js pages.

To learn more about Makeswift, take a look at the following resources:

- [Makeswift Website](https://www.makeswift.com/)
- [Makeswift Documentation](https://www.makeswift.com/docs/)
- [Makeswift Discord Community](https://discord.gg/dGNdF3Uzfz)

You can check out [the Makeswift GitHub repository](https://github.com/makeswift/makeswift) - your feedback and contributions are welcome!
