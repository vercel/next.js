
# Redux example

## How to use

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/nested-components
cd nested-components
```

or clone the repo:

```bash
git clone https://github.com/zeit/next.js.git --depth=1
cd next.js/examples/nested-components
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

Taking advantage of the composable nature of React components we can modularize our apps in self-contained, meaningful components. This example has a page under `pages/index.js` that uses `components/paragraph.js` and `components/post.js` that can be styled and managed separately.
