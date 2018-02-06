[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/custom-server)

# Custom server example

## How to use

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/custom-charset
cd custom-charset
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

The HTTP/1.1 specification says - if charset is not set in the http header then the browser defaults use ISO-8859-1. 
For languages like Polish, Albanian, Hungarian, Czech, Slovak, Slovene, there will be broken characters encoding from SSR.

You can overwrite Content-Type in getInitialProps. But if you want to handle it as a server side concern, you can use this as an simple example.
