# react-helmet example

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-react-helmet)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-helmet with-react-helmet-app
# or
yarn create next-app --example with-react-helmet with-react-helmet-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-helmet
cd with-react-helmet
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## Notes

This an minimalistic example of how to combine next.js and [react-helmet](https://github.com/nfl/react-helmet).
The title of the page shall be changed to "Hello next.js!"
If you go to the page `/about`, the title will be overridden to "About | Hello next.js!"
The rest is all up to you.
