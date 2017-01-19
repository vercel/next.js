
# Parametrized routes example (dynamic routing)

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/parameterized-routing
cd parameterized-routing
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

Next.js allows [Custom server and routing](https://github.com/zeit/next.js#custom-server-and-routing) so you can, as we show in this example, parametrize your routes. What we are doing in `server.js` is matching any route with the pattern `/blog/:id` and then passing the id as a parameter to the `pages/blog.js` page.
