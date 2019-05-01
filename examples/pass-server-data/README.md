# Pass Server Data Directly to a Next.js Page during SSR

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example pass-server-data pass-server-data-app
# or
yarn create next-app --example pass-server-data pass-server-data-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/pass-server-data
cd pass-server-data
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

If you already have a custom server which has local data (for instance cached data from an API call, or data read
from a file at startup) that you wish to make available in the Next.js page, you can pass that data in the query
parameter of `nextApp.render()`.

This is not the only way to pass data. You could also expose an endpoint and make a `fetch()` call to localhost, or you could
import server-side code with `eval` (necessary to prevent webpack from trying to package your server code). However both
solutions leave something to be desired in either performance or elegance.

This example shows the express server at `server.js` reading in a file at load time with static data (this could also have been
data cached from an API call) in `operations/get-item.js`. It has two routes: a home page, and an item page. The item page uses
data from the get-item operation, passed as a query parameter in `routes/item.js`.

We use this data in `pages/item.js` if rendered server-side, or make a fetch request if rendered client-side.
The server knows whether or not to use next.js to render the route based on the Accept header, which will be
`application/json` when we fetch client-side.

Take a look at the following files:

* server.js
* routes/item.js
* pages/item.js
* operations/get-item.js
