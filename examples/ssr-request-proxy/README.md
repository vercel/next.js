# SSR Request Proxy

Request on client easily can be proxy through browser, but imagine you want to pass your Server Side Requests through a proxy, currently there is no way for it on Next.js.
You can write a [custom server](https://nextjs.org/docs/app/building-your-application/configuring/custom-server) but it will be ruined all optimize of next server.

I use two library for proxying ssr requests:
1) [undici](https://www.npmjs.com/package/undici) ---> Prefer for using with `fetch`
2) [https-proxy-agent](https://www.npmjs.com/package/https-proxy-agent) ---> Prefer for using with `axios`

Methods one and two do not work interchangeably.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/ssr-request-proxy&project-name=ssr-request-proxy&repository-name=ssr-request-proxy)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), [pnpm](https://pnpm.io), or [Bun](https://bun.sh/docs/cli/bunx) to bootstrap the example:

```bash
npx create-next-app --example ssr-request-proxy ssr-request-proxy-app
```

```bash
yarn create next-app --example ssr-request-proxy ssr-request-proxy-app
```

```bash
pnpm create next-app --example ssr-request-proxy ssr-request-proxy-app
```

```bash
bunx create-next-app --example ssr-request-proxy ssr-request-proxy-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).