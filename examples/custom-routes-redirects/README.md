# Custom Routes Rewrites Example

The latest custom routes Redirects feature allows you to redirect an incoming request path to a different destination path. Redirects are most commonly used when a website is reorganized — ensuring search engines and bookmarks are forwarded to their new locations.

This example has one single page `pages/under-construction`. If you run the example and try to access the `slash (/)` route you will now be redirected to the `/under-construction` page. This is possible because of the `redirects` key that we have set in `next.config.js`, it takes in a `source` value (in this case `/`) , `destination` value (`/under-construction`) and a `permanent` value (`true`)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/custom-routes-redirects)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example custom-routes-redirects custom-routes-redirects-app
# or
yarn create next-app --example custom-routes-redirects custom-routes-redirects-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-routes-redirects
cd custom-routes-redirects
```

### Step 4. Run Next.js in development mode

```bash
npm install
npm run dev

# or

yarn install
yarn dev
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
