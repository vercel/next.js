# with-custom-pages-directory

Example of how to set a custom `pages` directory. The only change that is needed is add the `pagesDir` property to your `next.config.js` file.

```
const path = require('path')

module.exports = {
  pagesDir: path.join(__dirname, 'src/universal/page-components')
}
```

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-custom-pages-directory with-custom-pages-directory-app
# or
yarn create next-app --example with-custom-pages-directory with-custom-pages-directory-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-custom-pages-directory
cd with-custom-pages-directory
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
