
# With universal configuration

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-universal-configuration
cd with-universal-configuration
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

This example show how to set custom environment variables for your application based on NODE_ENV using [transform-define](https://github.com/FormidableLabs/babel-plugin-transform-define).

## Caveats

Because a babel plugin is used the output is cached in `node_modules/.cache` by `babel-loader`. When modifying the configuration you will have to manually clear this cache to make changes visible.
