This is example of Redis Caching implementation for SSR Pages for [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

## Run with SSR

Here, server.js is defined as custom server to serve app. to start server:

```bash
npm run start:server
# or
yarn start:server
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You need to install `nodemon` before run this script. and you can check more about custom server from [here](https://nextjs.org/docs/advanced-features/custom-server).

## Learn More

To learn more about caching, take a look at the following resources:

- [next-redis-cache](https://www.npmjs.com/package/next-redis-cache) - learn about caching with redis in Next.js.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/import?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
