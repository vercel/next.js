# React 18

Next.js 13 requires using React 18, unlocking:

- [React 18](#react-18)
  - [Streaming SSR](#streaming-ssr)
  - [React Server Components](#react-server-components)
  - [Edge and Node.js Runtimes](#edge-and-nodejs-runtimes)

## Streaming SSR

In Next.js 13, you can start using the `app/` directory to take advantage of streaming server-rendering. Learn more by reading the `app/` directory documentation:

- [Streaming and Suspense](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming)
- [Instant Loading UI](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming)

[Deploy the `app/` directory example](https://vercel.com/templates/next.js/app-directory) to try Streaming SSR.

## React Server Components

In Next.js 13, you can start using the `app/` directory which use Server Components by default. Learn more by reading the `app/` directory documentation:

- [Rendering Fundamentals](https://nextjs.org/docs/app/building-your-application/rendering)
- [Server and Client Components](https://nextjs.org/docs/getting-started/react-essentials)

[Deploy the `app/` directory example](https://vercel.com/templates/next.js/app-directory) to try Server Components.

## Edge and Node.js Runtimes

Next.js has two **server runtimes** where you can render parts of your application code: the **Node.js Runtime** and the [**Edge Runtime**](/docs/api-reference/edge-runtime.md). Depending on your deployment infrastructure, both runtimes support streaming.

By default, Next.js uses the Node.js runtime. [Middleware](https://nextjs.org/docs/advanced-features/middleware) and [Edge API Routes](https://nextjs.org/docs/api-routes/edge-api-routes) use the Edge runtime.

[Learn more about the different runtimes](/docs/advanced-features/react-18/switchable-runtime.md).