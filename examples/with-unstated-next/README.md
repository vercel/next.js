# unstated-next example

```
Page                                                           Size     First Load
┌ ○ /404                                                       3.15 kB     61.1 kB
├ λ /server                                                    666 B       58.6 kB
├ ● /ssg                                                       668 B       58.6 kB
└ ○ /static                                                    647 B       58.6 kB
+ shared by all                                                57.9 kB
  ├ static/pages/_app.js                                       957 B
  ├ chunks/dc4711b72459cc8b36f23bd0259b1079ae91b4b3.92878c.js  10.3 kB
  ├ chunks/framework.0f140d.js                                 40 kB
  ├ runtime/main.f12511.js                                     5.95 kB
  └ runtime/webpack.b65cab.js                                  746 B

λ  (Server)  server-side renders at runtime (uses getInitialProps or getServerSideProps)
○  (Static)  automatically rendered as static HTML (uses no initial props)
●  (SSG)     automatically generated as static HTML + JSON (uses getStaticProps)
```

This example shows how to integrate [unstated-next](https://github.com/jamiebuilds/unstated-next) into next.js.

In particular, this example shows both static rendering and SSR examples.

The "counter" shows you how to preserve state from server to client and share the state within different page, you can expect the same state for "counter" when switching between Index and About page, observe that "counter" behaves differently from the "clock" example.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/import/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-unstated-next)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-unstated-next with-unstated-next-app
# or
yarn create next-app --example with-unstated-next with-unstated-next-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-unstated-next
cd with-unstated-next
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [ZEIT Now](https://zeit.co/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
