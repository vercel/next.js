
# Hello World example

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz next.js-master/examples/hello-world
cd next.js-master/examples/hello-world
```

or clone the repo:

```bash
git clone git@github.com:zeit/next.js.git --depth=1
cd next.js/examples/hello-world
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

This example shows the most basic idea behind Next. We have 2 pages: `pages/index.js` and `pages/about.js`. The former responds to `/` requests and the latter to `/about`. Using `next/link` you can add hyperlinks between them with universal routing capabilities.
