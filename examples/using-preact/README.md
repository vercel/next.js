# Preact example

This example uses [Preact](https://github.com/developit/preact) instead of React. It's a React like UI framework which is fast and small. Here we've customized Next.js to use Preact instead of React.

Here's how we did it:

- Use `next.config.js` to customize our webpack config by aliasing React to `preact/compat`
- Use `server.js` to make our server use Preact by aliasing React to `preact/compat`

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example using-preact using-preact-app
# or
yarn create next-app --example using-preact using-preact-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/using-preact
cd using-preact
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
