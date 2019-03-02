[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-zones)

# Using multiple zones

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-zones with-zones-app
# or
yarn create next-app --example with-zones with-zones-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-zones
cd with-zones
```

Install it and run:

```bash
npm install
# or
yarn
```

## The idea behind this example

With Next.js you can use multiple apps as a single app using it's multi-zones feature.
This is an example showing how to use it.

In this example, we've two apps: 'home' and 'blog'.
We also have a set of rules defined in `rules.json` for the proxy.

Now let's start two of our app using:

```bash
npm run home
npm run blog
# or
yarn home
yarn blog
```

Then start the proxy:

```bash
npm run proxy
# or
yarn proxy
```

Now you can visit http://localhost:9000 and access and develop both apps a single app.

### Proxy Rules

This is the place we define rules for our proxy. Here are the rules(in `rules.json`) available for this app:

```json
{
  "rules": [
    {
      "pathname": "/blog",
      "dest": "http://localhost:5000"
    },
    { "pathname": "/**", "dest": "http://localhost:4000" }
  ]
}
```

These rules are based on ZEIT now v1 [path alias](https://zeit.co/docs/features/path-aliases) rules and use [`micro-proxy`](https://github.com/zeit/micro-proxy) as the proxy.

## Special Notes

* All pages should be unique across zones. A page with the same name should not exist in multiple zones. Otherwise, there'll be unexpected behaviour in client side navigation.
  * According to the above example, a page named `blog` should not be exist in the `home` zone.

## Production Deployment

Here's how are going to deploy this application into production.

* Open the `now.json` and `next.config.js` files in both `blog` and `home` directories and change the aliases as you wish.
* Then update `routes` in `home/now.json` accordingly.
* Now deploy both apps:

```bash
cd home
now && now alias
cd ../blog
now && now alias
cd ..
```

> You can use a domain name of your choice in the above command instead of `with-zones.nextjs.org`.

That's it.
Now you can access the final app via: <https://with-zones.nextjs.org>
