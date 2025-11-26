# SuperTokens App with Next.js app directory

This is a simple application that is protected by SuperTokens. This app uses the Next.js app directory.

## How to use

### Using `create-next-app`

- Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-supertokens with-supertokens-app
```

```bash
yarn create next-app --example with-supertokens with-supertokens-app
```

```bash
pnpm create next-app --example with-supertokens with-supertokens-app
```

### Using `create-supertokens-app`

- Run the following command

```bash
npx create-supertokens-app@latest --frontend=next
```

```bash
yarn create-supertokens-app@latest --frontend=next
```

```bash
pnpm create-supertokens-app@latest --frontend=next
```

- Select the option to use the app directory

Follow the instructions after `create-supertokens-app` has finished

## Notes

- To know more about how this app works and to learn how to customise it based on your use cases refer to the [SuperTokens Documentation](https://supertokens.com/docs/guides)
- We have provided development OAuth keys for the various built-in third party providers in the `/app/config/backend.ts` file. Feel free to use them for development purposes, but **please create your own keys for production use**.
