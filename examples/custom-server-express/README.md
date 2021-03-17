# Custom Express Server example

Most of the time the default Next.js server will be enough but there are times you'll want to run your own server to customize routes or other kinds of app behavior. Next.js provides [Custom server and routing](https://github.com/vercel/next.js#custom-server-and-routing) options, so you can customize as much as you want.

Because the Next.js server is just a node.js module you can combine it with any other part of the node.js ecosystem. In this case we are using express to build a custom router on top of Next.

This example demonstrates a server that serves the component living in `pages/a.js` when the route `/b` is requested and `pages/b.js` when the route `/a` is accessed. This is obviously a non-standard routing strategy. You can see how this custom routing is being made inside `server.js`.

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example custom-server-express custom-server-express-app
# or
yarn create next-app --example custom-server-express custom-server-express-app
```

### Populate body property

Without the use of the body-parser package `req.body` will return undefined. To get express to populate `req.body` you need to install the body parser package and call the package within server.js.

Install the package:

```bash
npm install body-parser
```

Use the package within server.js:

```bash
const bodyParser = require('body-parser');

app.prepare().then(() => {
  const server = express();
  server.use(bodyParser.urlencoded({ extended: true }))
  server.use(bodyParser.json())
})
```
