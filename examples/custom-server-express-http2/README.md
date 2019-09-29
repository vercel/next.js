# Custom Express HTTP/2 Server example

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example custom-server-express-http2 custom-server-express-http2-app
# or
yarn create next-app --example custom-server-express-http2 custom-server-express-http2-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-server-express-http2
cd custom-server-express-http2
```

Create the public and private keys:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' \
  -keyout privateKey.key -out certificate.cert
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

Most of the times the default Next server will be enough but sometimes you want to run your own server to customize routes or other kind of the app behavior. Next provides a [Custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) so you can customize as much as you want.

Because the Next.js server is just a node.js module you can combine it with any other part of the node.js ecosystem. In this case we are using a HTTP/2 server with the spdy package. Beside its name, the package spdy provides support for both http/2 (h2) and spdy (2,3,3.1), and allow to be combined with express to build a custom router on top of Next and serve content through HTTP/2.

The example shows a server that render and serves two single pages when their corresponding route are requested. You can obviously use more advanced express routing strategy depending on your needs.

Since no major browser support HTTP/2 without encryption, don't forget to generate self-signed local certificate for development purpose.