[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-zones)

# Using multiple zones

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-zones
cd with-zones
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

With Next.js you can use multiple apps as a single client side app using it's multi-zones feature.
This is a example showing how to use it.

Simply develop your apps (zones) and map urls using a proxy. Here's a simple URL mapping:

* / -> localhost:3000/
* /about -> 127.0.0.1:3000/about

You've just show the simplest possible url mapping without using two apps. (Just to demonstrate the feature.)

Then when you are changing routes (using Link or Router), you can do it like this:

```
<Link href="localhost:3000/" as "/" />
<Link href="127.0.0.1:3000/about" as "/about" />
```

> Right now, when changing zones Next.js will do a hard reload.
> But in the future, you could navigate between zones without a hard reload.
