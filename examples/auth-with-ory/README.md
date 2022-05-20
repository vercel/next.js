# Authentication with Ory

This example shows how to add authentication to your Lambda functions using the
open source [Ory Kratos](https://github.com/ory/kratos) project.

## Deploy your own

Deploy the example using
[Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/auth-with-ory&env=ORY_SDK_URL&project-name=auth-with-ory&repository-name=auth-with-ory)

### Demo

https://kratos-nextjs-react-example.vercel.app

## How to Use

Execute
[`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app)
with [npm](https://docs.npmjs.com/cli/init) or
[Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/ory/kratos-nextjs-react-example auth-with-ory
# or
yarn create next-app --example https://github.com/ory/kratos-nextjs-react-example auth-with-ory
```

Per default this example will use the Ory Kratos public playground. You can
either run Ory Kratos in Ory Cloud or deploy Ory Kratos locally. Regardless of
what you choose, set the `ORY_SDK_URL` environment variable to your Ory Cloud or
Ory Kratos URL and start the app:

```shell
# If deployed on Ory Cloud:
# export ORY_SDK_URL=https://<your-project-slug>.projects.oryapis.com/
export ORY_SDK_URL=https://playground.projects.oryapis.com/
npm run dev
```

Learn more about this example in the [developer guide](https://www.ory.sh/login-spa-react-nextjs-authentication-example-api-open-source/?utm_source=vercel&utm_medium=github&utm_campaign=auth-with-ory)!

## Running End-to-End Tests

This repository contains end-to-end tests, checking if login, sign up, logout,
session management that you can expand on. To run the tests, execute the
following command:

```shell
npm run dev
```

and in another terminal window, run the following command:

```shell
npm run test:dev
```
