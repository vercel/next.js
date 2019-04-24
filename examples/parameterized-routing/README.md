# Parametrized routes example (dynamic routing)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example parameterized-routing parameterized-routing-app
# or
yarn create next-app --example parameterized-routing parameterized-routing-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/parameterized-routing
cd parameterized-routing
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

See now documentation [here](https://zeit.co/docs/v2/deployments/routes/) and Next.js example [here](https://zeit.co/examples/nextjs/) for info on deploying with [now](https://zeit.co/now) ([download](https://zeit.co/download))


## The idea behind the example

Next.js allows [Custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) so you can, as we show in this example, parametrize your routes. What we are doing in `server.js` is matching any route with the pattern `/blog/:id` and then passing the id as a parameter to the `pages/blog.js` page.
