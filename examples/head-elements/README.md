
# Head elements example

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/head-elements
cd head-elements
```

or clone the repo:

```bash
git clone https://github.com/zeit/next.js.git --depth=1
cd next.js/examples/head-elements
```

Install the dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

## The idea behind the example

For every page you can inject elements into the page head. This way you can add stylesheets, JS scripts, meta tags, a custom title or whatever you think is convenient to add inside the `<head>` of your page.

This example shows in `pages/index.js` how to add a title and a couple of meta tags.
