# Pass Server Data Directly to a Next.js Page during SSR

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-emotion-fiber with-emotion-fiber-app
# or
yarn create next-app --example with-emotion-fiber with-emotion-fiber-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-emotion-fiber
cd with-emotion-fiber
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

Extract and inline critical css with [emotion](https://github.com/emotion-js/emotion) using [emotion-server](https://github.com/emotion-js/emotion/tree/master/packages/emotion-server) and [react-emotion](https://github.com/emotion-js/emotion/tree/master/packages/react-emotion).
