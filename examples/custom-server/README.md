
# Custom server example

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/custom-server
cd custom-server
```

or clone the repo:

```bash
git clone git@github.com:zeit/next.js.git --depth=1
cd next.js/examples/custom-server
```

Install the dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm start
```

## The idea behind the example

Most of the times the default Next server will be enough but sometimes you want to run your own server to customize routes or other kind of the app behavior. Next provides a [Custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) so you can customize as much as you want.

The example shows a server that serves the component living in `pages/a.js` when the route `/b` is requested and `pages/b.js` when the route `/a` is accessed. This is obviously a non-standard routing strategy. You can see how this custom routing is being made inside `server.js`.
