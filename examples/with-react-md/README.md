# Example app with react-md

This example features how you use [react-md](https://react-md.dev/) (React Material Design) with Next.js.

I recommend reading [layout-component](../layout-component) example next to learn how to reuse the layout across the pages.

![Screenshot](https://cloud.githubusercontent.com/assets/304265/22472564/b2e04ff0-e7de-11e6-921e-d0c9833ac805.png)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-react-md)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-react-md with-react-md-app
# or
yarn create next-app --example with-react-md with-react-md-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-md
cd with-react-md
```

Install it and run:

```bash
npm install
ln -f -s ../node_modules/react-md/dist/react-md.light_blue-yellow.min.css public/react-md.light_blue-yellow.min.css
npm run dev
# or
yarn
ln -f -s ../node_modules/react-md/dist/react-md.light_blue-yellow.min.css public/react-md.light_blue-yellow.min.css
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
