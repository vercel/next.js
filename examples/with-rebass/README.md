# Example app with Rebass

This example features how you use [Rebass](http://jxnblk.com/rebass/) functional UI library with Next.js.

![Screenshot](https://cloud.githubusercontent.com/assets/304265/22472564/b2e04ff0-e7de-11e6-921e-d0c9833ac805.png)

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-rebass)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-rebass with-rebass-app
# or
yarn create next-app --example with-rebass with-rebass-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-rebass
cd with-rebass
```

Install it and run:

```bash
npm install
ln -f -s ../node_modules/react-md/dist/react-md.light_blue-yellow.min.css static/react-md.light_blue-yellow.min.css
npm run dev
# or
yarn
ln -f -s ../node_modules/react-md/dist/react-md.light_blue-yellow.min.css static/react-md.light_blue-yellow.min.css
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
