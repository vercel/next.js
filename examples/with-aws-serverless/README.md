[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-aws-serverless)

# Hello World example with Serverless

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-aws-serverless with-aws-serverless-app
# or
yarn create next-app --example with-aws-serverless with-aws-serverless-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-aws-serverless
cd with-aws-serverless
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

To run serverless offline
```bash
npm run offline 
# or
yarn offline
```

To deploy on AWS Lambda
```bash
npm run deploy
# or
yarn deploy
```

## The idea behind the example

This example shows the most basic idea behind Next running on AWS Lambda using serverless. We have 3 pages: `pages/index.js`, `pages/about.js`, and `pages/about2.js`. The former responds to `/` requests and the rest to `/about` and `/about2` respectively. Using `next/link` you can add hyperlinks between them with universal routing capabilities.