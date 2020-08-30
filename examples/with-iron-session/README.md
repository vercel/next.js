# Example application using [`next-iron-session`](https://github.com/vvo/next-iron-session)

This example creates an authentication system that uses a **signed and encrypted cookie to store session data**. It relies on [`next-iron-session`](https://github.com/vvo/next-iron-session).

It uses current best practices for authentication in the Next.js ecosystem.

**Features:**

- [Static Generation](https://nextjs.org/docs/basic-features/pages#static-generation-recommended) (SG), recommended example
- [Server-side Rendering](https://nextjs.org/docs/basic-features/pages#server-side-rendering) (SSR) example in case you need it
- Logged in status synchronized between browser windows/tabs using **`withUser`** hook and [`swr`](https://swr.now.sh/) module
- Layout based on the user's logged-in/out status
- Session data is signed and encrypted in a cookie

[`next-iron-session`](https://github.com/vvo/next-iron-session) also supports:

- Express / Connect middlewares
- Multiple encryption keys (password) to allow for seamless updates or just password rotation

---

<p align="center"><b>Online demo at <a href="https://next-iron-session.now.sh/">https://next-iron-session.now.sh/</a> 👀</b></p>

---

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-iron-session)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-iron-session with-iron-session-app
# or
yarn create next-app --example with-iron-session with-iron-session-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
