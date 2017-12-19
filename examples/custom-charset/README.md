# Custom Charset example

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

The goal of this example is to demonstrate how to set character encoding both client-side and server-side. The app is built using a custom express server and the headers are set there. Those headers are then passed to the client via the getInitialProps method and the meta tag. If no character encoding is set either server-side or client-side then the app will default to utf-8 encoding.
