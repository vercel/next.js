# react-multi-carousel example

Source code is hosted on the [react-multi-carorusel](https://github.com/YIZHUANG/react-multi-carousel/tree/master/examples/ssr) repository.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-react-multi-carousel)

_Live Example: https://react-multi-carousel.now.sh_

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-react-multi-carousel with-react-multi-carousel-app
# or
yarn create next-app --example with-react-multi-carousel with-react-multi-carousel-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-react-multi-carousel
cd with-react-multi-carousel
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

[react-multi-carousel](https://www.npmjs.com/package/react-multi-carousel) is a React component that provides a Carousel that renders on the server-side that supports multiple items with no external dependency.

The reason for that is i needed to implement a Carousel component for my own project, but couldn't find any that is lightweight and supports both ssr and allows me to customized.

## How does it work with ssr?

- On the server-side, we detect the user's device to decide how many items we are showing and then using flex-basis to assign \* width to the carousel item.
- On the client-side, old fashion getting width of the container and assign the average of it to each carousel item.

The UI part of this example is copy paste from for the sake of simplicity. [with-material-ui](https://github.com/zeit/next.js/tree/canary/examples/with-material-ui)
