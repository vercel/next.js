# Using a custom Babel config

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-custom-babel-config with-custom-babel-config-app
# or
yarn create next-app --example with-custom-babel-config with-custom-babel-config-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-custom-babel-config
cd with-custom-babel-config
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

This example features:

- An app using proposed [do expressions](https://babeljs.io/docs/plugins/transform-do-expressions/).
- It uses babel-preset-stage-0, which allows us to use above JavaScript feature.
- It uses '.babelrc' file in the app directory to add above preset.

> Most of the time, when writing a custom `.babelrc` file, you need to add `next/babel` as a preset.
