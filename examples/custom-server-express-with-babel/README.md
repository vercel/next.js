[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/custom-server-express-with-babel)

# Custom Express Server with Babel Example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example custom-server-express-with-babel custom-server-express--with-babel-app
# or
yarn create next-app --example custom-server-express-with-babel custom-server-express--with-babel-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-server-express-with-babel
cd custom-server-express-with-babel
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

This example is similar to [custom-server-express](https://github.com/zeit/next.js/tree/master/examples/custom-server-express), except you can use commonjs transpilation on your server files as well as your app files. Additionally, it demonstrates how you would separate your client transpilation config from your both your NextJS and Express server configs.
