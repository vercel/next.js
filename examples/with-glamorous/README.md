[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-glamorous)

# Example app with [glamorous](https://github.com/kentcdodds/glamorous)

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-glamorous
cd with-glamorous
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

This example features how to use [glamorous](https://github.com/kentcdodds/glamorous) as the styling solution instead of [styled-jsx](https://github.com/zeit/styled-jsx). It also incorporates [glamor](https://github.com/threepointone/glamor) since `glamor` is a dependency for `glamorous`.

We are creating three `div` elements with custom styles being shared across the elements. The styles includes the use of pseudo-elements and CSS animations.
