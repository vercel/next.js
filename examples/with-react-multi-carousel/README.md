# react-multi-carousel example

[react-multi-carousel](https://www.npmjs.com/package/react-multi-carousel) is a React component that provides a Carousel that renders on the server-side that supports multiple items with no external dependency.

## Preview

Preview the example live on [StackBlitz](http://stackblitz.com/):

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-react-multi-carousel)

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-react-multi-carousel&project-name=with-react-multi-carousel&repository-name=with-react-multi-carousel)

_Live Example: https://react-multi-carousel.vercel.app_

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-react-multi-carousel with-react-multi-carousel-app
# or
yarn create next-app --example with-react-multi-carousel with-react-multi-carousel-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## How does it work with ssr?

- On the server-side, we detect the user's device to decide how many items we are showing and then using flex-basis to assign \* width to the carousel item.
- On the client-side, old fashion getting width of the container and assign the average of it to each carousel item.

The UI part of this example is copy paste from for the sake of simplicity. [with-material-ui](https://github.com/vercel/next.js/tree/canary/examples/with-material-ui)

Source code is hosted on the [react-multi-carorusel](https://github.com/YIZHUANG/react-multi-carousel/tree/master/examples/ssr) repository.
