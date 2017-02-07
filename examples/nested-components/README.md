
# Example app using nested components

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/nested-components
cd nested-components
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

Taking advantage of the composable nature of React components we can modularize our apps in self-contained, meaningful components. This example has a page under `pages/index.js` that uses `components/paragraph.js` and `components/post.js` that can be styled and managed separately.
