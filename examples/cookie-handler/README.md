[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/cookie-handler)

# Cookie Handler

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/cookie-handler
cd cookie-handler
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

The main idea behind this example is to handle the cookies when the view is render on the server side. Because on the server side it can't be something like `document.cookie` because it can't access to the `document` so the idea is to have a middleware on the server of `Next.js` that will get the cookie and set it in `res.locals` making it accessible from the view with `static getInitialProps({ res })`

