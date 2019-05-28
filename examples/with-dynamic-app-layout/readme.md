# With dynamic `App` layout example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-dynamic-app-layout with-dynamic-app-layout-app
# or
yarn create next-app --example with-dynamic-app-layout with-dynamic-app-layout-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-dynamic-app-layout
cd with-dynamic-app-layout
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

Shows how to use _app.js to implement \_dynamic_ layouts for pages.
This is achieved by attaching a static `Layout` property to each page that needs a different layout. In that way, once we use `_app.js` to wrap our pages, we can get it from `Component.Layout` and render it accordingly.
