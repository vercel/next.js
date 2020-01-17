# Example with styled-components RTL

This example shows how to use nextjs with right to left (RTL) styles using styled-components.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-styled-components-rtl)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-styled-components-rtl with-styled-components-rtl-app
# or
yarn create next-app --example with-styled-components-rtl with-styled-components-rtl-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-styled-components-rtl
cd with-styled-components-rtl
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## Notes

Right to left allows to "flip" every element in your site to fit the needs of the cultures that are read from right to left (like arabic for example).

This example shows how to enable right to left styles using `styled-components`.

The good news, is there is no need of doing it manually anymore. `stylis-plugin-rtl` makes the transformation automatic.

From `pages/index.js` you can see, styles are `text-align: left;`, but what is actually applied is `text-align: right;`.
