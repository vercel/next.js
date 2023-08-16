# Example application using [`iron-session`](https://github.com/vvo/iron-session)

<p align="center"><b>👀 Online demo at <a href="https://iron-session-example.vercel.app/">https://iron-session-example.vercel.app</a></b></p>

---

This example creates an authentication system that uses a **signed and encrypted cookie to store session data**. It relies on [`iron-session`](https://github.com/vvo/iron-session).

It uses current best practices for authentication in the Next.js ecosystem and replicates parts of how the Vercel dashboard is built.

**Features of the example:**

- [API Routes](https://nextjs.org/docs/api-routes/dynamic-api-routes) and [getServerSideProps](https://nextjs.org/docs/basic-features/data-fetching/get-server-side-props) examples.
- The logged in status is synchronized between browser windows/tabs using **`useUser`** hook and the [`swr`](https://swr.vercel.app/).
- The layout is based on the user's logged-in/out status.
- The session data is signed and encrypted in a cookie (this is done automatically by `iron-session`).

[`iron-session`](https://github.com/vvo/iron-session) also provides:

- An Express middleware, which can be used in any Node.js HTTP framework.
- Multiple encryption keys (passwords) to allow for seamless updates or just password rotation.
- Full TypeScript support, including session data.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-iron-session)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-iron-session&project-name=with-iron-session&repository-name=with-iron-session)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-iron-session with-iron-session-app
```

```bash
yarn create next-app --example with-iron-session with-iron-session-app
```

```bash
pnpm create next-app --example with-iron-session with-iron-session-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
