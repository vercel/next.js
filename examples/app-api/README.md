# App Router Headless API

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example app-api
```

```bash
yarn create next-app --example app-api
```

```bash
pnpm create next-app --example app-api
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/route.ts`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## API Routes

This directory contains example API routes for the headless API app.

Here's an overview of the available routes:

1. Root Route (`/`):

   - Provides a list of available API endpoints.
   - Useful for discovering what the API offers.

2. Pokemon Routes:

   - List all Pokemon (`/pokemon`): Get an overview of available Pokemon.
   - Filter Pokemon by type (`/pokemon?type=grass`): Find Pokemon of a specific element.
   - Get a specific Pokemon (`/pokemon/25`): Fetch details about a particular Pokemon by ID.

3. Not Found Route:
   - Handles requests to undefined routes.
   - Returns a "Not Found" response for non-existent endpoints.

To explore these routes:

1. Start the development server.
2. Open your browser and navigate to `http://localhost:3000/[route]`.
3. Examine the responses to understand how each route works.

For more details on the implementation, check the corresponding files in the `app` directory.
