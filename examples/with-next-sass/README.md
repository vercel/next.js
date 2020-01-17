# Example app with next-sass

This example uses next-sass without css-modules. The config can be found in `next.config.js`, change `withSass()` to `withSass({cssModules: true})` if you use css-modules. Then in the code, you import the stylesheet as `import style from '../styles/style.scss'` and use it like `<div className={style.example}>`. [Learn more](https://github.com/zeit/next-plugins/tree/master/packages/next-sass).

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-next-sass)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-next-sass with-next-sass-app
# or
yarn create next-app --example with-next-sass with-next-sass-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-sass
cd with-next-sass
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

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
