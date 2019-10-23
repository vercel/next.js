# URL object routing

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-url-object-routing with-url-object-routing-app
# or
yarn create next-app --example with-url-object-routing with-url-object-routing-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-url-object-routing
cd with-url-object-routing
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

Next.js allows using [Node.js URL objects](https://nodejs.org/api/url.html#url_url_strings_and_url_objects) as `href` and `as` values for `<Link>` component and parameters of `Router#push` and `Router#replace`.

This simplify the usage of parameterized URLs when you have many query values.
