[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/data-fetch)

# Data fetch example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example data-fetch data-fetch-app
```

### Download manually

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
on the server and the client when necessary it's so easy with Next.

Using `getInitialProps` we will fetch data in the server for SSR and then in the client only when the component is re-mounted but not in the first paint.
