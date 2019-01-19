[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-external-styled-jsx-sass)

# Example app with next-sass

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-external-styled-jsx-sass with-external-styled-jsx-sass-app
# or
yarn create next-app --example with-external-styled-jsx-sass with-external-styled-jsx-sass-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-external-styled-jsx-sass
cd with-external-styled-jsx-sass
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Run production build with:

```bash
npm run build
npm run start
# or
yarn build
yarn start
```

## The idea behind the example

This example features:

An app with external CSS written in SASS and loaded and automatically scoped with `styled-jsx/webpack`. [Learn more](https://github.com/zeit/styled-jsx#styles-in-regular-css-files)
