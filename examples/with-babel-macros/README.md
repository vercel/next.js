[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-babel-macros)

# Example app with [babel-macros](https://github.com/kentcdodds/babel-macros)

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example with-babel-macros with-babel-macros-app
# or
yarn create next-app --example with-babel-macros with-babel-macros-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-babel-macros
cd with-babel-macros
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

This example features how to configure and use [`babel-macros`](https://github.com/kentcdodds/babel-macros) which allows you
to easily add babel plugins which export themselves as a macro without needing
to configure them.

You'll notice the configuration in `.babelrc` includes the `babel-macros`
plugin, then we can use the `preval.macro` in `pages/index.js` to pre-evaluate
code at build-time. `preval.macro` is effectively transforming our code, but
we didn't have to configure it to make that happen!

Specifically what we're doing is we're prevaling the username of the user who
ran the build.
