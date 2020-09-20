# Custom Server Subdomain Example

Most of the times the default Next server will be enough but sometimes you want to run your own server to customize routes or other kind of the app behavior. Next provides a [Custom server and routing](https://nextjs.org/docs/advanced-features/custom-server) so you can customize as much as you want.

Because the Next.js server is just a node.js module you can combine it with any other part of the node.js ecosystem. In this case we are using express to build a custom router on top of Next.

The example shows a server that serves the components living in `pages/admin` when the route `http://admin.lvh.me:3000` is requested and `pages/member` when the route `http://lvh.me:3000` is accessed. This is obviously a non-standard routing strategy. You can see how this custom routing is being made inside `server.js`.

Available routes:
* http://admin.lvh.me:3000
* http://admin.lvh.me:3000/sample-page
* http://lvh.me:3000
* http://lvh.me:3000/accounts/dashboard

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example custom-server-subdomain custom-server-subdomain-app
# or
yarn create next-app --example custom-server-subdomain custom-server-subdomain-app
```
