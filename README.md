<img width="112" alt="screen shot 2016-10-25 at 2 37 27 pm" src="https://cloud.githubusercontent.com/assets/13041/19686250/971bf7f8-9ac0-11e6-975c-188defd82df1.png">

[![Build Status](https://travis-ci.org/zeit/next.js.svg?branch=master)](https://travis-ci.org/zeit/next.js)
[![Coverage Status](https://coveralls.io/repos/zeit/next.js/badge.svg?branch=master)](https://coveralls.io/r/zeit/next.js?branch=master)
[![Slack Channel](https://zeit-slackin.now.sh/badge.svg)](https://zeit.chat)

Next.js is a minimalistic framework for server-rendered React applications.

**NOTE! the README on the `master` branch might not match that of the [latest stable release](https://github.com/zeit/next.js/releases/latest)! **

## How to use

Install it:

```bash
npm install next --save
```

and add a script to your package.json like this:

```json
{
  "scripts": {
    "dev": "next"
  }
}
```

After that, the file-system is the main API. Every `.js` file becomes a route that gets automatically processed and rendered.

Populate `./pages/index.js` inside your project:

```jsx
export default () => (
  <div>Welcome to next.js!</div>
)
```

and then just run `npm run dev` and go to `http://localhost:3000`

So far, we get:

- Automatic transpilation and bundling (with webpack and babel)
- Hot code reloading
- Server rendering and indexing of `./pages`
- Static file serving. `./static/` is mapped to `/static/`

To see how simple this is, check out the [sample app - nextgram](https://github.com/zeit/nextgram)

### Automatic code splitting

Every `import` you declare gets bundled and served with each page. That means pages never load unnecessary code!

```jsx
import cowsay from 'cowsay-browser'
export default () => (
  <pre>{ cowsay.say({ text: 'hi there!' }) }</pre>
)
```

### CSS

#### Built-in CSS support

<details>
  <summary><b>Examples</b></summary>
  - [Basic css](./examples/basic-css)
</details>

We bundle [styled-jsx](https://github.com/zeit/styled-jsx) to provide support for isolated scoped CSS. The aim is to support "shadow CSS" resembling of Web Components, which unfortunately [do not support server-rendering and are JS-only](https://github.com/w3c/webcomponents/issues/71).

```jsx
export default () => (
  <div>
    Hello world
    <p>scoped!</p>
    <style jsx>{`
      p {
        color: blue;
      }
      div {
        background: red;
      }
      @media (max-width: 600px) {
        div {
          background: blue;
        }
      }
    `}</style>
  </div>
)
```

#### CSS-in-JS

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
		<li><a href="./examples/with-styled-components">Styled components</a></li>
		<li><a href="./examples/with-styletron">Styletron</a></li>
	</ul>
</details></p>

It's possible to use any existing CSS-in-JS solution. The simplest one is inline styles:

```jsx
export default () => (
  <p style={{ color: 'red' }}>hi there</p>
)
```

To use more sophisticated CSS-in-JS solutions, you typically have to implement style flushing for server-side rendering. We enable this by allowing you to define your own [custom `<Document>`](#user-content-custom-document) component that wraps each page

### Static file serving (e.g.: images)

Create a folder called `static` in your project root directory. From your code you can then reference those files with `/static/` URLs:

```jsx
export default () => (
  <img src="/static/my-image.png" />
)
```

### Populating `<head>`

<details>
  <summary><b>Examples</b></summary>
  - [Head elements](./examples/head-elements)
</details>

We expose a built-in component for appending elements to the `<head>` of the page.

```jsx
import Head from 'next/head'
export default () => (
  <div>
    <Head>
      <title>My page title</title>
      <meta name="viewport" content="initial-scale=1.0, width=device-width" />
    </Head>
    <p>Hello world!</p>
  </div>
)
```

_Note: The contents of `<head>` get cleared upon unmounting the component, so make sure each page completely defines what it needs in `<head>`, without making assumptions about what other pages added_

### Fetching data and component lifecycle

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/data-fetch">Data fetch</a></li></ul>
</details></p>

When you need state, lifecycle hooks or **initial data population** you can export a `React.Component` (instead of a stateless function, like shown above):

```jsx
import React from 'react'
export default class extends React.Component {
  static async getInitialProps ({ req }) {
    return req
      ? { userAgent: req.headers['user-agent'] }
      : { userAgent: navigator.userAgent }
  }
  render () {
    return <div>
      Hello World {this.props.userAgent}
    </div>
  }
}
```

Notice that to load data when the page loads, we use `getInitialProps` which is an [`async`](https://zeit.co/blog/async-and-await) static method. It can asynchronously fetch anything that resolves to a JavaScript plain `Object`, which populates `props`.

For the initial page load, `getInitialProps` will execute on the server only. `getInitialProps` will only be executed on the client when navigating to a different route via the `Link` component or using the routing APIs.

`getInitialProps` receives a context object with the following properties:

- `pathname` - path section of URL
- `query` - query string section of URL parsed as an object
- `req` - HTTP request object (server only)
- `res` - HTTP response object (server only)
- `xhr` - XMLHttpRequest object (client only)
- `err` - Error object if any error is encountered during the rendering

### Routing

#### With `<Link>`

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/using-routing">Basic routing</a></li></ul>
</details></p>

Client-side transitions between routes can be enabled via a `<Link>` component. Consider these two pages:

```jsx
// pages/index.js
import Link from 'next/link'
export default () => (
  <div>Click <Link href="/about"><a>here</a></Link> to read more</div>
)
```

```jsx
// pages/about.js
export default () => (
  <p>Welcome to About!</p>
)
```

Client-side routing behaves exactly like the browser:

1. The component is fetched
2. If it defines `getInitialProps`, data is fetched. If an error occurs, `_error.js` is rendered
3. After 1 and 2 complete, `pushState` is performed and the new component rendered

Each top-level component receives a `url` property with the following API:

- `pathname` - `String` of the current path excluding the query string
- `query` - `Object` with the parsed query string. Defaults to `{}`
- `push(url, as=url)` - performs a `pushState` call with the given url
- `replace(url, as=url)` - performs a `replaceState` call with the given url

The second `as` parameter for `push` and `replace` is an optional _decoration_ of the URL. Useful if you configured custom routes on the server.

#### Imperatively

You can also do client-side page transitions using the `next/router`

```jsx
import Router from 'next/router'

export default () => (
  <div>Click <span onClick={() => Router.push('/about')}>here</span> to read more</div>
)
```

Above `Router` object comes with the following API:

- `route` - `String` of the current route
- `pathname` - `String` of the current path excluding the query string
- `query` - `Object` with the parsed query string. Defaults to `{}`
- `push(url, as=url)` - performs a `pushState` call with the given url
- `replace(url, as=url)` - performs a `replaceState` call with the given url

The second `as` parameter for `push` and `replace` is an optional _decoration_ of the URL. Useful if you configured custom routes on the server.

_Note: in order to programmatically change the route without triggering navigation and component-fetching, use `props.url.push` and `props.url.replace` within a component_

### Prefetching Pages

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-prefetching">Prefetching</a></li></ul>
</details></p>

Next.js exposes a module that configures a `ServiceWorker` automatically to prefetch pages: `next/prefetch`.

Since Next.js server-renders your pages, this allows all the future interaction paths of your app to be instant. Effectively Next.js gives you the great initial download performance of a _website_, with the ahead-of-time download capabilities of an _app_. [Read more](https://zeit.co/blog/next#anticipation-is-the-key-to-performance).

#### With `<Link>`

You can substitute your usage of `<Link>` with the default export of `next/prefetch`. For example:

```jsx
import Link from 'next/prefetch'
// example header component
export default () => (
  <nav>
    <ul>
      <li><Link href='/'><a>Home</a></Link></li>
      <li><Link href='/about'><a>About</a></Link></li>
      <li><Link href='/contact'><a>Contact</a></Link></li>
    </ul>
  </nav>
)
```

When this higher-level `<Link>` component is first used, the `ServiceWorker` gets installed. To turn off prefetching on a per-`<Link>` basis, you can use the `prefetch` attribute:

```jsx
<Link href='/contact' prefetch={false}>Home</Link>
```

#### Imperatively

Most needs are addressed by `<Link />`, but we also expose an imperative API for advanced usage:

```jsx
import { prefetch } from 'next/prefetch'
export default ({ url }) => (
  <div>
    <a onClick={ () => setTimeout(() => url.pushTo('/dynamic'), 100) }>
      A route transition will happen after 100ms
    </a>
    {
      // but we can prefetch it!
      prefetch('/dynamic')
    }
  </div>
)
```

### Custom server and routing

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/custom-server">Basic custom server</a></li>
    <li><a href="./examples/custom-server-express">Express integration</a></li>
    <li><a href="./examples/parameterized-routing">Parameterized routing</a></li>
  </ul>
</details></p>

Typically you start your next server with `next start`. It's possible, however, to start a server 100% programmatically in order to customize routes, use route patterns, etc

This example makes `/a` resolve to `./pages/b`, and `/b` resolve to `./pages/a`:

```js
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const app = next({ dev: true })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    const { pathname, query } = parse(req.url, true)

    if (pathname === '/a') {
      app.render(req, res, '/b', query)
    } else if (pathname === '/b') {
      app.render(req, res, '/a', query)
    } else {
      handle(req, res)
    }
  })
  .listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
```

The `next` API is as follows:
- `next(path: string, opts: object)` - `path` is
- `next(opts: object)`

Supported options:
- `dev` (`bool`) whether to launch Next.js in dev mode - default `false`
- `dir` (`string`) where the Next project is located - default `'.'`
- `quiet` (`bool`) Display error messages with server information - default `false`

### Custom `<Document>`

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-styled-components">Styled components custom document</a></li></ul>
</details></p>

Pages in `Next.js` skip the definition of the surrounding document's markup. For example, you never include `<html>`, `<body>`, etc. But we still make it possible to override that:

```jsx
import Document, { Head, Main, NextScript } from `next/document`

export default class MyDocument extends Document {
  static async getInitialProps (ctx) {
    const props = await Document.getInitialProps(ctx)
    return { ...props, customValue: 'hi there!' }
  }

  render () {
    return (
     <html>
       <Head>
         <style>{`body { margin: 0 } /* custom! */`}</style>
       </Head>
       <body className="custom_class">
         {this.props.customValue}
         <Main />
         <NextScript />
       </body>
     </html>
    )
  }
}
```

The `ctx` object is equivalent to the one received in all [`getInitialProps`](#fetching-data-and-component-lifecycle) hooks, with one addition:

- `renderPage` (`Function`) a callback that executes the actual React rendering logic (synchronously). It's useful to decorate this function in order to support server-rendering wrappers like Aphrodite's [`renderStatic`](https://github.com/Khan/aphrodite#server-side-rendering)

### Custom error handling

404 or 500 errors are handled both client and server side by a default component `error.js`. If you wish to override it, define a `_error.js`:

```jsx
import React from 'react'
export default class Error extends React.Component {
  static getInitialProps ({ res, xhr }) {
    const statusCode = res ? res.statusCode : (xhr ? xhr.status : null)
    return { statusCode }
  }

  render () {
    return (
      <p>{
        this.props.statusCode
        ? `An error ${this.props.statusCode} occurred on server`
        : 'An error occurred on client'
      }</p>
    )
  }
}
```

### Custom configuration

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-custom-babel-config">Custom babel configuration</a></li></ul>
</details></p>

For custom advanced behavior of Next.js, you can create a `next.config.js` in the root of your project directory (next to `pages/` and `package.json`).

Note: `next.config.js` is a regular Node.js module, not a JSON file. It gets used by the Next server and build phases, and not included in the browser build.

```javascript
// next.config.js
module.exports = {
  /* config options here */
}
```

### Customizing webpack config

In order to extend our usage of `webpack`, you can define a function that extends its config via `next.config.js`.

The following example shows how you can use [`react-svg-loader`](https://github.com/boopathi/react-svg-loader) to easily import any `.svg` file as a React component, without modification.

```js
// This file is not going through babel transformation.
// So, we write it in vanilla JS
// (But you could use ES2015 features supported by your Node.js version)

module.exports = {
  webpack: (config, { dev }) => {
    config.module.rules.push({ test: /\.svg$/, loader: 'babel!react-svg' })

    // Important: return the modified config
    return config
  }
}
```

### Customizing babel config

In order to extend our usage of `babel`, you can define a function that extends its config via `next.config.js`.

The following example config shows you how to use `babel-preset-stage-0` with your app.

```js
// This file is not going through babel transformation.
// So, we write it in vanilla JS
// (But you could use ES2015 features supported by your Node.js version)

module.exports = {
  // config is the set of options we pass to our babel-loaders's query option
  babel: function (config, { dev }) {
    // Add the stage-0 preset.
    // Make sure to use 'require.resolve' otherwise we won't be able to find it.
    config.presets.push(require.resolve('babel-preset-stage-0'))

    // Important: return the modified config
    return config
  }
}
```

## Production deployment

To deploy, instead of running `next`, you probably want to build ahead of time. Therefore, building and starting are separate commands:

```bash
next build
next start
```

For example, to deploy with [`now`](https://zeit.co/now) a `package.json` like follows is recommended:

```json
{
  "name": "my-app",
  "dependencies": {
    "next": "latest"
  },
  "scripts": {
    "dev": "next",
    "build": "next build",
    "start": "next start"
  }
}
```

Then run `now` and enjoy!

Note: we recommend putting `.next` in `.npmignore` or `.gitignore`. Otherwise, use `files` or `now.files` to opt-into a whitelist of files you want to deploy (and obviously exclude `.next`)

## FAQ

<details>
  <summary>Is this production ready?</summary>
  Next.js has been powering `https://zeit.co` since its inception.

  We’re ecstatic about both the developer experience and end-user performance, so we decided to share it with the community.
</details>

<details>
  <summary>How big is it?</summary>

The client side bundle size should be measured in a per-app basis.
A small Next main bundle is around 65kb gzipped.

</details>

<details>
  <summary>Is this like `create-react-app`?</summary>

Yes and No.

Yes in that both make your life easier.

No in that it enforces a _structure_ so that we can do more advanced things like:
- Server side rendering
- Automatic code splitting

In addition, Next.js provides two built-in features that are critical for every single website:
- Routing with lazy component loading: `
>` (by importing `next/link`)
- A way for components to alter `<head>`: `<Head>` (by importing `next/head`)

If you want to create re-usable React components that you can embed in your Next.js app or other React applications, using `create-react-app` is a great idea. You can later `import` it and keep your codebase clean!

</details>

<details>
  <summary>How do I use CSS-in-JS solutions?</summary>

Next.js bundles [styled-jsx](https://github.com/zeit/styled-jsx) supporting scoped css. However you can use a CSS-in-JS solution in your Next app by just including your favorite library [as mentioned before](#css-in-js) in the document.
</details>

<details>
  <summary>What syntactic features are transpiled? How do I change them?</summary>

We track V8. Since V8 has wide support for ES6 and `async` and `await`, we transpile those. Since V8 doesn’t support class decorators, we don’t transpile those.

See [this](https://github.com/zeit/next.js/blob/master/server/build/webpack.js#L79) and [this](https://github.com/zeit/next.js/issues/26)

</details>

<details>
  <summary>Why a new Router?</summary>

Next.js is special in that:

- Routes don’t need to be known ahead of time
- Routes are always lazy-loadable
- Top-level components can define `getInitialProps` that should _block_ the loading of the route (either when server-rendering or lazy-loading)

As a result, we were able to introduce a very simple approach to routing that consists of two pieces:

- Every top level component receives a `url` object to inspect the url or perform modifications to the history
- A `<Link />` component is used to wrap elements like anchors (`<a/>`) to perform client-side transitions

We tested the flexibility of the routing with some interesting scenarios. For an example, check out [nextgram](https://github.com/zeit/nextgram).

</details>

<details>
<summary>How do I define a custom fancy route?</summary>

We [added](#custom-server-and-routing) the ability to map between an arbitrary URL and any component by supplying a request handler.

On the client side, we have a parameter call `as` on `<Link>` that _decorates_ the URL differently from the URL it _fetches_.
</details>

<details>
<summary>How do I fetch data?</summary>

It’s up to you. `getInitialProps` is an `async` function (or a regular function that returns a `Promise`). It can retrieve data from anywhere.
</details>

<details>
<summary>Can I use it with Redux?</summary>

Yes! Here's an [example](./examples/with-redux)
</details>

<details>
<summary>What is this inspired by?</summary>

Many of the goals we set out to accomplish were the ones listed in [The 7 principles of Rich Web Applications](http://rauchg.com/2014/7-principles-of-rich-web-applications/) by Guillermo Rauch.

The ease-of-use of PHP is a great inspiration. We feel Next.js is a suitable replacement for many scenarios where you otherwise would use PHP to output HTML.

Unlike PHP, we benefit from the ES6 module system and every file exports a **component or function** that can be easily imported for lazy evaluation or testing.

As we were researching options for server-rendering React that didn’t involve a large number of steps, we came across [react-page](https://github.com/facebookarchive/react-page) (now deprecated), a similar approach to Next.js by the creator of React Jordan Walke.

</details>

## Roadmap

Our Roadmap towards 2.0.0 [is public](https://github.com/zeit/next.js/wiki/Roadmap#nextjs-200).

## Authors

- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) – ▲ZEIT
- Tony Kovanen ([@tonykovanen](https://twitter.com/tonykovanen)) – ▲ZEIT
- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) – ▲ZEIT
- Dan Zajdband ([@impronunciable](https://twitter.com/impronunciable)) – Knight-Mozilla / Coral Project
