# With universal configuration

This example shows how to use environment variables and customize one based on NODE_ENV for your application using a `.env.local` file and `next.config.js`.

When you build your application the environment variable is transformed into a primitive (string or undefined) and can only be changed with a new build. This happens for both client-side and server-side. If the environment variable is prefixed with `NEXT_PUBLIC_` it will have effect on the server-side and client-side, otherwise it will have effect on the server-side only.

You can read more about environement variables [here](https://nextjs.org/docs/basic-features/environment-variables)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-universal-configuration-build-time)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-universal-configuration-build-time with-universal-configuration-build-time-app
# or
yarn create next-app --example with-universal-configuration-build-time with-universal-configuration-build-time-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-universal-configuration-build-time
cd with-universal-configuration-build-time
```

Install it and run:

```bash
npm install
VARIABLE_EXAMPLE=next.js npm run dev
# or
yarn
VARIABLE_EXAMPLE=next.js yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Please note

- It is a bad practice to commit env vars to a repository. Thats why you should normally [gitignore](https://git-scm.com/docs/gitignore) your `.env` file.
- Any env var you expose in `next.config.js` will be publicly available and exposed to the client.
- This example sets the environment configuration at build time, meaning the same build might not be used in e.g. both staging and production. For a solution which sets the environment at runtime, see the example [with-universal-configuration-runtime](../with-universal-configuration-runtime).
