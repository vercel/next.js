
# Example app with [isomorphic-style-loader](https://github.com/kriasoft/isomorphic-style-loader)

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-isomorphic-style-loader
cd with-isomorphic-style-loader
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

This example features how to use a different styling solution than [styled-jsx](https://github.com/zeit/styled-jsx) that also supports universal styles. That means we can serve the required styles for the first render within the HTML and then load the rest in the client. In this case we are using [isomorphic-style-loader](https://github.com/kriasoft/isomorphic-style-loader).

Because isomorphic-style-loader requires a custom context when rendering, each page must be wrapped using the `pageWithStyles.js`, which is a [HOC](https://facebook.github.io/react/docs/higher-order-components.html).

Custom Documents cannot pass down a context because the HTML is rendered in a box by next.js.

Also included are some common defaults for postcss, which could be replaced with another loader, like sass.

CSS files are bundled as JavaScript modules in dev mode.
