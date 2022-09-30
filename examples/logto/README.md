# Next.js and Logto Example

This example shows how you can use `@logto/next` to easily integrate [Logto](https://logto.io) with your Next.js application.

Read more: [https://docs.logto.io/docs/recipes/integrate-logto/next-js](https://docs.logto.io/docs/recipes/integrate-logto/next-js)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example logto logto-app
```

```bash
yarn create next-app --example logto logto-app
```

```bash
pnpm create next-app --example logto logto-app
```

### Update configs

To connect the app with Logto, you'll need to setup an application in Logto's Admin Console, and then update the [libraries/logto.ts](./libraries/logto.ts) file.

```ts
export const logtoClient = new LogtoClient({
  appId: '<your-application-id>',
  appSecret: '<your-app-secret-copied-from-console>',
  endpoint: '<your-logto-endpoint>', // E.g. http://localhost:3001
  baseUrl: '<your-nextjs-app-base-url>', // E.g. http://localhost:3000
  cookieSecret: 'complex_password_at_least_32_characters_long',
  cookieSecure: process.env.NODE_ENV === 'production',
})
```
