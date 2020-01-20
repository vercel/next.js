# Custom server ReasonML example

ReasonML is an exciting new language. Since it can compile directly to JS via [BuckleScript](https://bucklescript.github.io/en/),
we can power our backend server with ReasonML and also build the frontend with
[ReasonReact](https://reasonml.github.io/reason-react/en/) (covered in the [with-reasonml example](https://github.com/zeit/next.js/tree/canary/examples/with-reasonml)).

This example shows how powerful and helpful it is to build a Next.js custom server with a typesafe language. It is based off the [custom-server example](https://github.com/zeit/next.js/tree/canary/examples/custom-server) that uses pure Node.js to build the custom server.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example custom-server-reasonml custom-server-reasonml-app
# or
yarn create next-app --example custom-server-reasonml custom-server-reasonml-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-server-reasonml
cd custom-server-reasonml
```

### Run the development app

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

### Build the app

```bash
npm run next:build
# or
yarn next:build
```

### Run the production app

Run this command after building:

```bash
npm start
# or
yarn start
```

### Deploy the app

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```
