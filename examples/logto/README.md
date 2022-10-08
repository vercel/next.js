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

### Set up environment variables

To connect the app with Logto, you'll need to setup an application in Logto's Admin Console, and get the settings as environment variables.

Copy the `.env.local.example` file in this directory to `.env.local` (which will be ignored by Git).

Then, open `.env.local` and add the missing environment variables:

- `LOGTO_APP_ID`: Can be found in `Application` page of Logto's Admin Console.
- `LOGTO_APP_SECRET`: Can be found in `Application` page of Logto's Admin Console.
- `LOGTO_ENDPOINT`: Your Logto instance's endpoint. For example, `https://logto.dev`.
- `BASE_URL`: The base URL of your application. For example, `http://localhost:3000`.
- `COOKIE_SECRET`: A random complex password that at least 32 characters long.
