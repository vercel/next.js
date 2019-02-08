[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-react-esi)
# React ESI example

# Example app with prefetching pages

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-esi with-react-esi-app
# or
yarn create next-app --example with-react-esi with-react-esi-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-esi
cd with-react-esi
```

### Starting the Varnish cache server

A Docker setup containing Varnish with [the appropriate config](docker/varnish/default.vcl) and Node is provided.
Run the following command to start the project:

```bash
docker-compose up
```

## The idea behind the example

React Server Side rendering is very costly and takes a lot of server's CPU power for that.
One of the best solutions for this problem is cache fragments of rendered pages, each fragment corresponding to a component subtree.
This example shows how to leverage [React ESI](https://github.com/dunglas/react-esi) and the Varnish HTTP accelerator to improve dramatically the performance of an app.

The example (and the underlying lib) can work with any ESI implementation, including Akamai, Fastly and Cloudflare Workers.
