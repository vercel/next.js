[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-styled-jsx-postcss)

# Example app with styled-jsx-postcss

This example features how you use PostCSS with styled-jsx via [styled-jsx-postcss](https://github.com/giuseppeg/styled-jsx-postcss)

N.B. In order to integrate `styled-jsx-postcss` with Next.js you need to patch Next.js'
babel preset. See [babel-preset.js](./babel-preset.js) and [.babelrc](./.babelrc).

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-styled-jsx-postcss
cd with-styled-jsx-postcss
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
