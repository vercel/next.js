[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-storybook)

# Example app with Storybook

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-storybook with-storybook-app
# or
yarn create next-app --example with-storybook with-storybook-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-storybook
cd with-storybook
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

## Run Storybook

```bash
npm run storybook
# or
yarn storybook
```

## Build Static Storybook

```bash
npm run build-storybook
# or
yarn build-storybook
```

Deploy Storybook to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
npm run build-storybook
# or
yarn build-storybook
# then
cd storybook-static
now
```

## The idea behind the example

This example shows a default set up of Storybook. Also included in the example is a custom component included in both Storybook and the Next.js application.
