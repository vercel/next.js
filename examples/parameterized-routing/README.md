[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/parameterized-routing)

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

Download the example [or clone the repo](https://github.com/zeit/next.js):

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

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

Next.js allows [Custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) so you can, as we show in this example, parametrize your routes. What we are doing in `server.js` is matching any route with the pattern `/blog/:id` and then passing the id as a parameter to the `pages/blog.js` page.
