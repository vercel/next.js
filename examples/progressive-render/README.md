# Example app implementing progressive server-side render

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/progressive-render
cd progressive-render
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

Sometimes you want to **not** server render some parts of your application. That can be third party components without server render capabilities, components that depends on `window` and other browser only APIs or just because that content isn't important enough for the user (eg. below the fold content).

In that case you can wrap the component in `react-no-ssr` which will only render the component client-side.

This example features:

* An app with a component that must only be rendered in the client
* A loading component that will be displayed before rendering the client-only component

**Example**: https://progressive-render-raceuevkqw.now.sh/
