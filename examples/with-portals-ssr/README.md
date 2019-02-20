# Example with Server Side Rendered portals

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-portals-ssr with-portals-ssr
# or
yarn create next-app --example with-portals-ssr with-portals-ssr
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-portals-ssr
cd with-portals-ssr
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

An example of Server Side Rendered React [Portals](https://reactjs.org/docs/portals.html) with
[`@jesstelford/react-portal-universal`](https://www.npmjs.com/package/@jesstelford/react-portal-universal)
and Next.js.
