
# Head elements example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/head-elements
cd head-elements
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

For every page you can inject elements into the page head. This way you can add stylesheets, JS scripts, meta tags, a custom title or whatever you think is convenient to add inside the `<head>` of your page.

This example shows in `pages/index.js` how to add a title and a couple of meta tags.
