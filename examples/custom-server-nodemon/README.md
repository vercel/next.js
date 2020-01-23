# Custom server with Nodemon example

The example shows how you can apply [Nodemon](https://nodemon.io/) to a custom server to have live reload of the server code without being affected by the Next.js universal code.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example custom-server-nodemon custom-server-nodemon-app
# or
yarn create next-app --example custom-server-nodemon custom-server-nodemon-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-server-nodemon
cd custom-server-nodemon
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
