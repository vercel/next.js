# react-multi-carousel example

Source code is hosted on the [react-multi-carorusel](https://github.com/YIZHUANG/react-multi-carousel/tree/master/examples/ssr) repository.

[![Demo](https://react-multi-carousel.now.sh/)

### Usage

Install and run:

```bash
npm install
npm run dev
```

## The idea behind the example

[react-multi-carousel](https://www.npmjs.com/package/react-multi-carousel) is a React component that provides a Carousel that renders on the server-side that supports multiple items with no external dependency.

The reason for that is i needed to implement a Carousel component for my own project, but couldn't find any that is lightweight and supports both ssr and allows me to customized.

## How does it work with ssr?

- On the server-side, we detect the user's device to decide how many items we are showing and then using flex-basis to assign \* width to the carousel item.
- On the client-side, old fashion getting width of the container and assign the average of it to each carousel item.

The UI part of this example is copy paste from for the sake of simplicity. [with-material-ui](https://github.com/zeit/next.js/tree/canary/examples/with-material-ui)
