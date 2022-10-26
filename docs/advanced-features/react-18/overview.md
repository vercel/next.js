# React 18

Next.js 13 requires using React 18, unlocking:

- [Streaming SSR](#streaming-ssr)
- [React Server Components](#react-server-components)
- [Edge and Node.js Runtimes](#edge-and-nodejs-runtimes)
- New APIs like `startTransition` and more.

## Streaming SSR

In Next.js 13, you can start using the `app/` directory (beta) to take advantage of streaming server-rendering. Learn more by reading the `app/` directory (beta) documentation:

- [Streaming and Suspense](https://beta.nextjs.org/docs/data-fetching/streaming-and-suspense)
- [Instant Loading UI](https://beta.nextjs.org/docs/routing/loading-ui)

[Deploy the `app/` directory example](https://vercel.com/templates/next.js/app-directory) to try Streaming SSR.

## React Server Components

In Next.js 13, you can start using the `app/` directory (beta) which use Server Components by default. Learn more by reading the `app/` directory (beta) documentation:

- [Rendering Fundamentals](https://beta.nextjs.org/docs/rendering/fundamentals)
- [Server and Client Components](https://beta.nextjs.org/docs/rendering/server-and-client-components)

[Deploy the `app/` directory example](https://vercel.com/templates/next.js/app-directory) to try Server Components.

## Edge and Node.js Runtimes

Next.js has two **server runtimes** where you can render parts of your application code: the **Node.js Runtime** and the [**Edge Runtime**](/docs/api-reference/edge-runtime.md). Depending on your deployment infrastructure, both runtimes support streaming.

By default, Next.js uses the Node.js runtime. [Middleware](https://nextjs.org/docs/advanced-features/middleware) and [Edge API Routes](https://nextjs.org/docs/api-routes/edge-api-routes) use the Edge runtime.

[Learn more about the different runtimes](/docs/advanced-features/react-18/switchable-runtime.md).
