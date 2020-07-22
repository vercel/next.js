# Custom Routes Rewrites Example

The latest custom routes Rewrites feature allows you to map an incoming request path to a different destination path. Rewrites are the most commonly used form of custom routing — they're used for dynamic routes (pretty URLs), user-land routing libraries (e.g. next-routes), internationalization, and other advanced use cases.

This is a basic example of dynamic routes (pretty URLs). The example has two pages `pages/index.js` and `pages/pretty-long-file-name-for-an-about-page.js`. The index page has a `Link` tag which has a href of `/about` . When clicked on the link, the page at `/pretty-long-file-name-for-an-about-page` is rendered instead of the 404 error page since we don't have any `/about` page created. This is possible because of the `rewrites` key that we have set in `next.config.js`, it takes in a `source` value (in this case `/about`) and a `destination` value (`/pretty-long-file-name-for-an-about-page`) .

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/custom-routes-rewrites)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example custom-routes-rewrites custom-routes-rewrites-app
# or
yarn create next-app --example custom-routes-rewrites custom-routes-rewrites-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/vercel/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-routes-rewrites
cd custom-routes-rewrites
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
