
# Server subclass example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/server-subclass
cd server-subclass
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

Next provides 2 main ways to run the server - either using the built-in http handling provided by `server/index.js`, or by [running your own custom server](https://github.com/zeit/next.js#custom-server-and-routing). This approach is between the all-or-nothing approaches, allowing you to override server methods without losing all of the dev tooling provided by the `next` command.

This example shows you how you could replace the http server (and add custom routes) while still running your application with `next dev` or `next start`.

Note that because the server.js uses async/await, this example only runs in node.js >= 7.6.
