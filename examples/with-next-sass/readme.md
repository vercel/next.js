[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-jest)

# Example app with next-sass

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example with-next-sass with-next-sass-app
# or
yarn create next-app --example with-next-sass with-next-sass-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-sass
cd with-next-sass
```

Install it and run:

```bash
npm install
npm run build
npm run start
```

The dev mode is also support via `npm run dev`

## The idea behind the example

This example features:

* An app with next-sass

This example uses next-sass without css-modules. The config can be found in `next.config.js`, change `withSass()` to `withSass({cssModules: true})` if you use css-modules. Then in the code, you import the stylesheet as `import style '../styles/style.scss'` and use it like `<div className={style.example}>`.

[Learn more](https://github.com/zeit/next-plugins/tree/master/packages/next-sass)
