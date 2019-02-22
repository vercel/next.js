[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-yarn-workspaces)

# Yarn workspaces example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-yarn-workspaces with-yarn-workspaces-app
# or
yarn create next-app --example with-yarn-workspaces with-yarn-workspaces-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-yarn-workspaces
cd with-yarn-workspaces
```

Install it and run:

```bash
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

Workspaces are a new way to setup your package architecture that’s available by default starting from Yarn 1.0. It allows you to setup multiple packages in such a way that you only need to run yarn install once to install all of them in a single pass.

In this example we have three workspaces:

* **web-app**: A Next.js app
* **foo**: A normal node module
* **bar**: A react component, that gets compiled by Next.js (see [packages/web-app/next.config.js](./packages/web-app/next.config.js) for more info)

## Useful Links

* [Documentation](https://yarnpkg.com/en/docs/workspaces)
* [yarn workspaces](https://yarnpkg.com/lang/en/docs/cli/workspace)
* [yarn workspace](https://yarnpkg.com/lang/en/docs/cli/workspaces)
* [next-transpile-modules](https://www.npmjs.com/package/next-transpile-modules)
