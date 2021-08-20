# Example application using [`next-iron-session`](https://github.com/vvo/next-iron-session)

---

<p align="center"><b>Online demo at <a href="https://next-iron-session.vercel.app/">https://next-iron-session.vercel.app/</a> 👀</b></p>

---

This example creates an authentication system that uses a **signed and encrypted cookie to store session data**. It relies on [`next-iron-session`](https://github.com/vvo/next-iron-session).

It uses current best practices for authentication in the Next.js ecosystem.

On the next-iron-session repository (https://github.com/vvo/next-iron-session) you'll find:

- full API documentation and explanations on how it works
- [TypeScript example](https://github.com/vvo/next-iron-session/tree/master/examples/next-typescript)
- [JavaScript example](https://github.com/vvo/next-iron-session/tree/master/examples/next.js)
- [Express.js example](https://github.com/vvo/next-iron-session/tree/master/examples/express)

**Features:**

- [Static Generation](https://nextjs.org/docs/basic-features/pages#static-generation-recommended) (SG), recommended example
- [Server-side Rendering](https://nextjs.org/docs/basic-features/pages#server-side-rendering) (SSR) example in case you need it
- Logged in status synchronized between browser windows/tabs using **`useUser`** hook and [`swr`](https://swr.vercel.app/) module
- Layout based on the user's logged-in/out status
- Session data is signed and encrypted in a cookie

[`next-iron-session`](https://github.com/vvo/next-iron-session) also supports:

- Express / Connect middlewares
- Multiple encryption keys (passwords) to allow for seamless updates or just password rotation

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-iron-session)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-iron-session&project-name=with-iron-session&repository-name=with-iron-session)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-iron-session with-iron-session-app
# or
yarn create next-app --example with-iron-session with-iron-session-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
