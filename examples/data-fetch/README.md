[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/data-fetch)

# Data fetch example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/data-fetch
cd data-fetch
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

Next.js was conceived to make it easy to create universal apps. That's why fetching data
on the server and the client when necessary is so easy with Next.

Using `getInitialProps` fetches data on the server for SSR and then on the client when the component is re-mounted (not on the first paint).
