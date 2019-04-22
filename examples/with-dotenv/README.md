# With Dotenv example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-dotenv with-dotenv-app
# or
yarn create next-app --example with-dotenv with-dotenv-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-dotenv
cd with-dotenv
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example shows how to inline env vars.

**Please note**:

- It is a bad practice to commit env vars to a repository. Thats why you should normally [gitignore](https://git-scm.com/docs/gitignore) your `.env` file.
- In this example, as soon as you reference an env var in your code it will be automatically be publicly available and exposed to the client.
- If you want to have more centralized control of what is exposed to the client check out the example [with-universal-configuration-build-time](../with-universal-configuration-build-time).
- Env vars are set (inlined) at build time. If you need to configure your app on rutime check out [examples/with-universal-configuration-runtime](../with-universal-configuration-runtime).
