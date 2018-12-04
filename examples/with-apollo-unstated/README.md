## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-apollo with-apollo-app-unstated
# or
yarn create next-app --example with-apollo with-apollo-app-unstated
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-apollo-unstated
cd with-apollo-unstated
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

## The idea behind the example

This simple example shows you how to:   
1. How to Apollo in Next.
2. How to SSR Apollo in Next.
3. How to use Unstated to share state across pages.

What to expect when you npm run dev?
1. The data is fetched when the page is loaded.
2. if you do not update the state in Index page, you will not see the data in About page.
3. Update the state in Index page and go back to About page again, the same data is there.


## Acknowledgement

Greatly Inspired by [Next Apollo Example](https://github.com/zeit/next.js/tree/canary/examples/with-apollo)