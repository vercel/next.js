# An ecommerce app example using Next.js and Magento

This example showcase on using Next.js , Magento , Apollo Client and Redux to build an e-commerce app

## Configuration

![Image of URL Config for Category in Magneto 2](https://github.com/vercel/next.js/blob/canary/examples/cms-magento/docs/seo.png)

Change URL in the index file with your Category URL

Create env.local file

```
GRAPHQL_URL=https://www.magentoURL.com/graphql
NEXT_PUBLIC_GRAPHQL_URL=https://www.magentoURL.com/graphql
```

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example cms-magento cms-magento-app
# or
yarn create next-app --example cms-magento cms-magento-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/cms-magento
cd cms-magento
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
