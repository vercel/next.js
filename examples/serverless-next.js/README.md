# Serverless Nextjs Component

A [serverless component](https://github.com/serverless-components/) that allows you to deploy your Next.js application to AWS.

The deployment is made to [CloudFront](https://aws.amazon.com/cloudfront/) and [Lambda@edge](https://aws.amazon.com/lambda/edge/) which allows for a global content distribution with minimal latency for your users. The component takes care of all the routing for you so there is no configuration needed.

## Getting started

Install serverless globally: `npm install -g serverless`

Review the sample configuration set in the `serverless.yml`.

Set your AWS credentials as environment variables:

```bash
AWS_ACCESS_KEY_ID=accesskey
AWS_SECRET_ACCESS_KEY=sshhh
```

And simply deploy:

```bash
$ serverless
```

Learn more at [serverless-next.js](https://github.com/danielcondemarin/serverless-next.js)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example serverless-next.js serverless-next.js-app
# or
yarn create next-app --example serverless-next.js serverless-next.js-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/serverless-next.js
cd serverless-next.js
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
