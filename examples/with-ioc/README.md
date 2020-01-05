# Dependency Injection (IoC) example ([ioc](https://github.com/alexindigo/ioc))

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-ioc with-ioc-app
# or
yarn create next-app --example with-ioc with-ioc-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-ioc
cd with-ioc
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

This example uses [ioc](https://github.com/alexindigo/ioc) for dependency injection, which lets you create decoupled shared components and keep them free from implementation details of your app / other components.

It builds on top of [with-next-routes](https://github.com/zeit/next.js/tree/master/examples/with-next-routes) example and makes use of dependency injection to propagate custom `Link` component to other components.

Also, it illustrates ergonomics of testing using dependency injection.
