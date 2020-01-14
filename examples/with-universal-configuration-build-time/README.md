# With universal configuration

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-universal-configuration-build-time)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-universal-configuration-build-time with-universal-configuration-build-time-app
# or
yarn create next-app --example with-universal-configuration-build-time with-universal-configuration-build-time-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-universal-configuration-build-time
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

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

This example shows how to use environment variables and customize one based on NODE_ENV for your application using `dotenv`, a `.env`-file and `next.config.js`.

When you build your application the environment variable is transformed into a primitive (string or undefined) and can only be changed with a new build. This happens for both client-side and server-side. If the environment variable is used directly in your application it will only have an effect on the server side, not the client side.

## Please note

- It is a bad practice to commit env vars to a repository. Thats why you should normally [gitignore](https://git-scm.com/docs/gitignore) your `.env` file.
- Any env var you expose in `next.config.js` will be publicly available and exposed to the client.
- This example sets the environment configuration at build time, meaning the same build might not be used in e.g. both staging and production. For a solution which sets the environment at runtime, see the example [with-universal-configuration-runtime](../with-universal-configuration-runtime).
- If you have many variables in `.env` and want to expose them without listing them all in `next.config.js`, see the example [with-dotenv](../with-dotenv). That example automatically exposes any variable that has been referenced in code, but keeps all other variables secret.
