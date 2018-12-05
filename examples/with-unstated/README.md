[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/canary/examples/with-unstated)

# Unstated example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-unstated with-unstated-app
# or
yarn create next-app --example with-unstated with-unstated-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-unstated
cd with-unstated
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

This example shows how to integrate Unstated in Next.js. For more info about Unstated you can visit [here](https://github.com/jamiebuilds/unstated). The example is basically same as [redux example](https://github.com/zeit/next.js/tree/canary/examples/with-redux).

This example also shows how to share state within different page, you can expect the same state for Counter when switching between Index and About.

