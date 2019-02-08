# React ESI example

## How to use

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-esi
cd with-react-ga
```

Install it and run using Docker:

```bash
docker-compose up
```

## The idea behind the example

React Server Side rendering is very costly and takes a lot of server's CPU power for that.
One of the best solutions for this problem is cache fragments of rendered pages, each fragment corresponding to a component subtree.
This example shows how to leverage [React ESI](https://github.com/dunglas/react-esi) and the Varnish HTTP accelerator to improve dramatically the performance of an app.

The example (and the underlying lib) can work with any ESI implementation, including Akamai, Fastly and Cloudflare Workers.
