This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

This example shows how to add a Serverless Cloud API to your Next.js app.

## Getting Started

First, start your Serverless Cloud personal instance:

```bash
cd api
npm start
```

The first time you run this you will get the URL for your personal instance. Copy this into `.env.local` in the project root, for example:

```bash
# .env.local
NEXT_PUBLIC_CLOUD_URL=<your personal instance url>
```

This value is used in `next.config.js`.

In a separate terminal window, run the Next.js development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Serverless Cloud Documentation](https://www.serverless.com/cloud/docs) - learn about the Serverless Cloud application development platform.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Deploy the Serverless Cloud API

To deploy a `production` instance:

```bash
cd api
npm run deploy
```

The first time you run this, you'll get the URL for the production API. Add this as a parameter named `NEXT_PUBLIC_CLOUD_URL` in your app settings in the Vercel dashboard.
