
# Parametrized routes example

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz next.js-master/examples/parametrized-routing
cd next.js-master/examples/parametrized-routing
```

or clone the repo:

```bash
git clone git@github.com:zeit/next.js.git --depth=1
cd next.js/examples/parametrized-routing
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

Next.js allows [Custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) so you can, as we show in this example, parametrize your routes. What we are doing in `server.js` is matching any route with the pattern `/blog/:id` and then passing the id as a parameter to the `pages/blog.js` page.
