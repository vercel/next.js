
# Styled components example

## How to use

Download the example (or clone the repo)[https://github.com/zeit/next.js.git]:

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
