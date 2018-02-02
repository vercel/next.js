# Example app with imported and hashed statics

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-hashed-statics with-hashed-statics-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-hashed-statics
cd with-hashed-statics
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

This example shows how to import images, videos, etc. from `/static` and get the URL with a hash query allowing to use better cache without problems.

This example supports `.svg`, `.png` and `.txt` extensions, but it can be configured to support any possible extension changing the `extensions` array in the `.babelrc` file.