# Example app with custom compress encodings

## How to use

Download the example (or clone the repo)[https://github.com/zeit/next.js.git]:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-custom-compress-encodings
cd with-custom-compress-encodings
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

By default, Next.js compile your assets with `gzip` compression. But if you want to add support more encodings like `br` or `deflate` you can do it very easily.

This example shows how to add support for `br` and `gzip` compress encodings. For that it uses a config in `next.config.js`.
