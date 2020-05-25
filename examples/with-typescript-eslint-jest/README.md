# NextJS Typescript Boilerplate

Bootstrap a developer-friendly NextJS app configured with:

- Typescript
- Linting with ESLint
- Formatting with Prettier
- Linting, typechecking and formatting on by default using [`husky`](https://github.com/typicode/husky) for commit hooks
- Testing with Jest and [`react-testing-library`](https://testing-library.com/docs/react-testing-library/intro)
- Debug task (`yarn dev:debug`) with node auto-attachment
  _See [setup](#setup) for detailed eslint, prettier + husky configuration_

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-typescript-eslint-jest)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-typescript-eslint-jest with-typescript-eslint-jest-app
# or
yarn create next-app --example with-typescript-eslint-jest with-typescript-eslint-jest-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-typescript-eslint-jest
cd with-typescript-eslint-jest
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

### Configuration

After bootstrapping your next.js app, there are several steps to enable Husky (for pre-commit and push linting) and Eslint's Prettier config. These steps must be performed manually due to conflicts with the linting and CI configuration of the next.js monorepo.

**Eslint + Prettier**

1. Install `eslint-config-prettier`: `yarn add -D eslint-config-prettier`
2. Uncomment the `"prettier"` value from the `extends` key in `.eslintrc.json`

**Husky**
Opt into husky commit hooks by adding the following values to your `package.json` (or tweak your own, or remove `husky` and `lint-staged` from your project `devDependencies`):

```json
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "pre-push": "yarn run type-check"
    }
  },
  "lint-staged": {
    "*.@(ts|tsx)": [
      "yarn lint",
      "yarn format"
    ]
  }
```
