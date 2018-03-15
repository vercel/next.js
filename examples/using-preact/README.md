[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/using-preact)

# Hello World example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```bash
npx create-next-app --example using-preact using-preact-app
# or
yarn create next-app --example using-preact using-preact-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/using-preact
cd using-preact
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

This example uses [Preact](https://github.com/developit/preact) instead of React. It's a React like UI framework which is fast and small. Here we've customized Next.js to use Preact instead of React.

Here's how we did it:

* Use `next.config.js` to customize our webpack config to support [preact-compat](https://github.com/developit/preact-compat)
