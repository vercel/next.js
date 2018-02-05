[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-url-object-routing)
# URL object routing

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-url-object-routing with-url-object-routing-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-url-object-routing
cd with-url-object-routing
```

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

Next.js allows using [Node.js URL objects](https://nodejs.org/api/url.html#url_url_strings_and_url_objects) as `href` and `as` values for `<Link>` component and parameters of `Router#push` and `Router#replace`.

This simplify the usage of parameterized URLs when you have many query values.
