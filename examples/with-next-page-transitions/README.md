# next-page-transitions example

The [`next-page-transitions`](https://github.com/illinois/next-page-transitions) library is a component that sits at the app level and allows you to animate page changes. It works especially nicely with apps with a shared layout element, like a navbar. This component will ensure that only one page is ever mounted at a time, and manages the timing of animations for you. This component works similarly to [`react-transition-group`](https://github.com/reactjs/react-transition-group) in that it applies classes to a container around your page; it's up to you to write the CSS transitions or animations to make things pretty!

This example includes two pages with links between them. The "About" page demonstrates how `next-page-transitions` makes it easy to add a loading state when navigating to a page: it will wait for the page to "load" its content (in this examples, that's simulated with a timeout) and then hide the loading indicator and animate in the page when it's done.

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-next-page-transitions)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npm init next-app --example with-next-page-transitions with-next-page-transitions
# or
yarn create next-app --example with-next-page-transitions with-next-page-transitions
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-next-page-transitions
cd with-next-page-transitions
```

Install it and run:

```bash
npm install
npm run build
npm start
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```
