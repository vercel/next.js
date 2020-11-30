# next-boost example

[next-boost](https://github.com/rjyo/next-boost/) is a drop-in middleware which adds a disk cache layer to your Next applications. It works with next.js or a custom server like express.js.

It can be considered as an implementation of Incremental Static Regeneration, but works with `getServerSideProps`.

- Drop-in replacement for Next.js's production mode: `next start`
- Greatly reducing the server TTFB (time-to-first-byte)
- Non-blocking main process for cache-serving and using `worker_threads` for SSR
- HTTP API to delete a certain page
- By using a [database-disk-hybrid cache](https://github.com/rjyo/hybrid-disk-cache), `next-boost` has
    - no memory capacity limit, and works great on cheap VPSs
    - no need to add a cache layer server like varnish, nginx Cache and etc.
    - great performance, and may even have [better performace than pure file system](https://www.sqlite.org/fasterthanfs.html) cache
    - portability on major platforms
- Small footprint: [148 LOC](https://coveralls.io/github/rjyo/next-boost?branch=master)
- Used in production with 300K pages cached

You can find more info and some benchmarks on [next-boost](https://github.com/rjyo/next-boost/)'s github page.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-next-boost with-next-boost-app
# or
yarn create next-app --example with-next-boost with-next-boost-app
```

### How to run the drop-in next-boost

```bash
# to build the next.js app
npm run build
# start next with next-boost
npm start
```

### How to run the custom server with express.js

```bash
# dev mode
npm run dev
# to build the next.js app
npm run build
# start the express server in production mode
node run prod
```

### Check the results

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result like below,

![demo1](https://i.imgur.com/hYbJLtH.png)

The cache's behavior is defined in `.next-boost.js` and you can find more on the [next-boost](https://github.com/rjyo/next-boost)'s github page.

