# next-auth

Example with [`next-auth`](https://github.com/iaincollins/next-auth) integration.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com/now):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-next-auth)

## How to use

A Prerequisite here is that you provide some sort of authentication mechanism, be that in the form of OAuth keys/secrets from a provider (Google, Twitter, etc.) or an SMTP connection string to enable email authentication.

You must copy the `.env.example.local` file and create your own `.env.local` file and fill out at least one of the authentication provider variables.

More details about the providers can be found [here](https://next-auth.js.org/configuration/providers)

More 'Getting Started' details can be found [here](https://next-auth.js.org/getting-started/example).

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example next-auth with-next-auth-app
# or
yarn create next-app --example next-auth with-next-auth-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/next-auth
cd next-auth
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
