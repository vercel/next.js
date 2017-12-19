[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/using-inferno)

# Hello World example

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example using-inferno using-inferno-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/using-inferno
cd using-inferno
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

This example uses [Inferno](https://github.com/infernojs/inferno), an insanely fast, 9kb React-like library for building high-performance user interfaces on both the client and server. Here we've customized Next.js to use Inferno instead of React.

Here's how we did it:

* Use `next.config.js` to customize our webpack config to support [inferno-compat](https://www.npmjs.com/package/inferno-compat)
