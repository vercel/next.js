<img width="112" alt="screen shot 2016-10-25 at 2 37 27 pm" src="https://cloud.githubusercontent.com/assets/13041/19686250/971bf7f8-9ac0-11e6-975c-188defd82df1.png">

[![Build Status](https://travis-ci.org/zeit/next.js.svg?branch=master)](https://travis-ci.org/zeit/next.js)
[![Build status](https://ci.appveyor.com/api/projects/status/gqp5hs71l3ebtx1r/branch/v3-beta?svg=true)](https://ci.appveyor.com/project/arunoda/next-js/branch/v3-beta)
[![Coverage Status](https://coveralls.io/repos/zeit/next.js/badge.svg?branch=master)](https://coveralls.io/r/zeit/next.js?branch=master)
[![Slack Channel](http://zeit-slackin.now.sh/badge.svg)](https://zeit.chat)

Next.js is a minimalistic framework for server-rendered React applications.

**Visit https://learnnextjs.com to get started with Next.js.**

---

This is the documentation for our latest **beta** of version 3.0 which comes with **static export** and **dynamic imports**.
For the documentation of the latest **stable** release, [visit here](https://github.com/zeit/next.js/blob/master/readme.md).

---

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
<!-- https://github.com/thlorenz/doctoc -->

- [How to use](#how-to-use)
  - [Setup](#setup)
  - [Automatic code splitting](#automatic-code-splitting)
  - [CSS](#css)
    - [Built-in CSS support](#built-in-css-support)
    - [CSS-in-JS](#css-in-js)
  - [Static file serving (e.g.: images)](#static-file-serving-eg-images)
  - [Populating `<head>`](#populating-head)
  - [Fetching data and component lifecycle](#fetching-data-and-component-lifecycle)
  - [Routing](#routing)
    - [With `<Link>`](#with-link)
    - [Imperatively](#imperatively)
      - [Router Events](#router-events)
      - [Shallow Routing](#shallow-routing)
  - [Prefetching Pages](#prefetching-pages)
    - [With `<Link>`](#with-link-1)
    - [Imperatively](#imperatively-1)
  - [Custom server and routing](#custom-server-and-routing)
  - [Dynamic Import](#dynamic-import)
  - [Custom `<Document>`](#custom-document)
  - [Custom error handling](#custom-error-handling)
  - [Custom configuration](#custom-configuration)
  - [Customizing webpack config](#customizing-webpack-config)
  - [Customizing babel config](#customizing-babel-config)
  - [CDN support with Asset Prefix](#cdn-support-with-asset-prefix)
- [Production deployment](#production-deployment)
- [Static HTML export](#static-html-export)
- [Recipes](#recipes)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Authors](#authors)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## How to use

### Setup

Install it:

```bash
npm install next@beta react react-dom --save
```

and add a script to your package.json like this:

```json
{
  "scripts": {
    "dev": "next",
    "build": "next build",
    "start": "next start"
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

and then just run `npm run dev` and go to `http://localhost:3000`. To use another port, you can run `npm run dev -- -p <your port here>`.

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

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/basic-css">Basic css</a></li></ul>
</details></p>

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
    <style global jsx>{`
      body {
        background: black;
      }
    `}</style>
  </div>
)
```

Please see the [styled-jsx documentation](https://www.npmjs.com/package/styled-jsx) for more examples.

#### CSS-in-JS

<p><details>
  <summary>
    <b>Examples</b>
    </summary>
  <ul><li><a href="./examples/with-styled-components">Styled components</a></li><li><a href="./examples/with-styletron">Styletron</a></li><li><a href="./examples/with-glamor">Glamor</a></li><li><a href="./examples/with-glamorous">Glamorous</a></li><li><a href="./examples/with-cxs">Cxs</a></li><li><a href="./examples/with-aphrodite">Aphrodite</a></li><li><a href="./examples/with-fela">Fela</a></li></ul>
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

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/head-elements">Head elements</a></li>
    <li><a href="./examples/layout-component">Layout component</a></li>
  </ul>
</details></p>

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

_Note: `getInitialProps` can **not** be used in children components. Only in `pages`._

<br/>

> If you are using some server only modules inside `getInitialProps`, make sure to [import them properly](https://arunoda.me/blog/ssr-and-server-only-modules).
> Otherwise, it'll slow down your app.

<br/>

You can also define the `getInitialProps` lifecycle method for stateless components:

```jsx
const Page = ({ stars }) => <div>Next stars: {stars}</div>

Page.getInitialProps = async ({ req }) => {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const json = await res.json()
  return { stars: json.stargazers_count }
}

export default Page
```

`getInitialProps` receives a context object with the following properties:

- `pathname` - path section of URL
- `query` - query string section of URL parsed as an object
- `asPath` - the actual url path
- `req` - HTTP request object (server only)
- `res` - HTTP response object (server only)
- `jsonPageRes` - [Fetch Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) object (client only)
- `err` - Error object if any error is encountered during the rendering

### Routing

#### With `<Link>`

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/hello-world">Hello World</a></li>
  </ul>
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

__Note: use [`<Link prefetch>`](#prefetching-pages) for maximum performance, to link and prefetch in the background at the same time__

Client-side routing behaves exactly like the browser:

1. The component is fetched
2. If it defines `getInitialProps`, data is fetched. If an error occurs, `_error.js` is rendered
3. After 1 and 2 complete, `pushState` is performed and the new component rendered

Each top-level component receives a `url` property with the following API:

- `pathname` - `String` of the current path excluding the query string
- `query` - `Object` with the parsed query string. Defaults to `{}`
- `asPath` - `String` of the actual path (including the query) shows in the browser
- `push(url, as=url)` - performs a `pushState` call with the given url
- `replace(url, as=url)` - performs a `replaceState` call with the given url

The second `as` parameter for `push` and `replace` is an optional _decoration_ of the URL. Useful if you configured custom routes on the server.

##### With URL object

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-url-object-routing">With URL Object Routing</a></li>
  </ul>
</details></p>

The component `<Link>` can also receive an URL object and it will automatically format it to create the URL string.

```jsx
// pages/index.js
import Link from 'next/link'
export default () => (
  <div>Click <Link href={{ pathname: 'about', query: { name: 'Zeit' }}}><a>here</a></Link> to read more</div>
)
```

That will generate the URL string `/about?name=Zeit`, you can use every property as defined in the [Node.js URL module documentation](https://nodejs.org/api/url.html#url_url_strings_and_url_objects).

##### Replace instead of push url

The default behaviour for the `<Link>` component is to `push` a new url into the stack. You can use the `replace` prop to prevent adding a new entry.

```jsx
// pages/index.js
import Link from 'next/link'
export default () => (
  <div>Click <Link href='/about' replace><a>here</a></Link> to read more</div>
)
```

##### Using a component that support `onClick`

`<Link>` supports any component that supports the `onClick` event. In case you don't provide an `<a>` tag, it will only add the `onClick` event handler and won't pass the `href` property.

```jsx
// pages/index.js
import Link from 'next/link'
export default () => (
  <div>Click <Link href='/about'><img src="/static/image.png"></Link></div>
)
```

#### Imperatively

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/using-router">Basic routing</a></li>
    <li><a href="./examples/with-loading">With a page loading indicator</a></li>
  </ul>
</details></p>

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

##### With URL object
You can use an URL object the same way you use it in a `<Link>` component to `push` and `replace` an url.

```jsx
import Router from 'next/router'

const handler = () => Router.push({
  pathname: 'about',
  query: { name: 'Zeit' }
})

export default () => (
  <div>Click <span onClick={handler}>here</span> to read more</div>
)
```

This uses of the same exact parameters as in the `<Link>` component.

##### Router Events

You can also listen to different events happening inside the Router.
Here's a list of supported events:

- `routeChangeStart(url)` - Fires when a route starts to change
- `routeChangeComplete(url)` - Fires when a route changed completely
- `routeChangeError(err, url)` - Fires when there's an error when changing routes
- `beforeHistoryChange(url)` - Fires just before changing the browser's history
- `appUpdated(nextRoute)` - Fires when switching pages and there's a new version of the app

> Here `url` is the URL shown in the browser. If you call `Router.push(url, as)` (or similar), then the value of `url` will be `as`.

Here's how to properly listen to the router event `routeChangeStart`:

```js
Router.onRouteChangeStart = (url) => {
  console.log('App is changing to: ', url)
}
```

If you are no longer want to listen to that event, you can simply unset the event listener like this:

```js
Router.onRouteChangeStart = null
```

If a route load is cancelled (for example by clicking two links rapidly in succession), `routeChangeError` will fire. The passed `err` will contained a `cancelled` property set to `true`.

```js
Router.onRouteChangeError = (err, url) => {
  if (err.cancelled) {
    console.log(`Route to ${url} was cancelled!`)
  }
}
```

If you change a route while in between a new deployment, we can't navigate the app via client side. We need to do a full browser navigation. We do it automatically for you.

But you can customize that via `Route.onAppUpdated` event like this:

```js
Router.onAppUpdated = (nextUrl) => {
  // persist the local state
  location.href = nextUrl
}
```

##### Shallow Routing

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-shallow-routing">Shallow Routing</a></li>
  </ul>
</details></p>

Shallow routing allows you to change the URL without running `getInitialProps`. You'll receive the updated `pathname` and the `query` via the `url` prop of the same page that's loaded, without losing state.

You can do this by invoking either `Router.push` or `Router.replace` with the `shallow: true` option. Here's an example:

```jsx
// Current URL is "/"
const href = '/?counter=10'
const as = href
Router.push(href, as, { shallow: true })
```

Now, the URL is updated to `/?counter=10`. You can see the updated URL with `this.props.url` inside the `Component`.

You can watch for URL changes via [`componentWillReceiveProps`](https://facebook.github.io/react/docs/react-component.html#componentwillreceiveprops) hook as shown below:

```jsx
componentWillReceiveProps(nextProps) {
  const { pathname, query } = nextProps.url
  // fetch data based on the new query
}
```

> NOTES:
>
> Shallow routing works **only** for same page URL changes. For an example, let's assume we've another page called `about`, and you run this:
> ```js
> Router.push('/about?counter=10', '/about?counter=10', { shallow: true })
> ```
> Since that's a new page, it'll unload the current page, load the new one and call `getInitialProps` even though we asked to do shallow routing.

### Prefetching Pages

(This is a production only feature)

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-prefetching">Prefetching</a></li></ul>
</details></p>

Next.js has an API which allows you to prefetch pages.

Since Next.js server-renders your pages, this allows all the future interaction paths of your app to be instant. Effectively Next.js gives you the great initial download performance of a _website_, with the ahead-of-time download capabilities of an _app_. [Read more](https://zeit.co/blog/next#anticipation-is-the-key-to-performance).

> With prefetching Next.js only download JS code. When the page is getting rendered, you may need to wait for the data.

#### With `<Link>`

You can add `prefetch` prop to any `<Link>` and Next.js will prefetch those pages in the background.

```jsx
import Link from 'next/link'

// example header component
export default () => (
  <nav>
    <ul>
      <li><Link prefetch href='/'><a>Home</a></Link></li>
      <li><Link prefetch href='/about'><a>About</a></Link></li>
      <li><Link prefetch href='/contact'><a>Contact</a></Link></li>
    </ul>
  </nav>
)
```

#### Imperatively

Most prefetching needs are addressed by `<Link />`, but we also expose an imperative API for advanced usage:

```jsx
import Router from 'next/router'
export default ({ url }) => (
  <div>
    <a onClick={ () => setTimeout(() => url.pushTo('/dynamic'), 100) }>
      A route transition will happen after 100ms
    </a>
    {
      // but we can prefetch it!
      Router.prefetch('/dynamic')
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
    <li><a href="./examples/custom-server-hapi">Hapi integration</a></li>
    <li><a href="./examples/custom-server-koa">Koa integration</a></li>
    <li><a href="./examples/parameterized-routing">Parameterized routing</a></li>
    <li><a href="./examples/ssr-caching">SSR caching</a></li>
  </ul>
</details></p>

Typically you start your next server with `next start`. It's possible, however, to start a server 100% programmatically in order to customize routes, use route patterns, etc

This example makes `/a` resolve to `./pages/b`, and `/b` resolve to `./pages/a`:

```js
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    // Be sure to pass `true` as the second argument to `url.parse`.
    // This tells it to parse the query portion of the URL.
    const parsedUrl = parse(req.url, true)
    const { pathname, query } = parsedUrl

    if (pathname === '/a') {
      app.render(req, res, '/b', query)
    } else if (pathname === '/b') {
      app.render(req, res, '/a', query)
    } else {
      handle(req, res, parsedUrl)
    }
  })
  .listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
```

The `next` API is as follows:
- `next(path: string, opts: object)` - `path` is where the Next project is located
- `next(opts: object)`

Supported options:
- `dev` (`bool`) whether to launch Next.js in dev mode - default `false`
- `dir` (`string`) where the Next project is located - default `'.'`
- `quiet` (`bool`) Hide error messages containing server information - default `false`
- `conf` (`object`) the same object you would use in `next.config.js` - default `{}`

Then, change your `start` script to `NODE_ENV=production node server.js`.

### Dynamic Import

<p><details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="./examples/with-dynamic-import">With Dynamic Import</a></li>
  </ul>
</details></p>

Next.js supports TC39 [dynamic import proposal](https://github.com/tc39/proposal-dynamic-import) for JavaScript.
With that, you could import JavaScript modules (inc. React Components) dynamically and work with them.

You can think dynamic imports as another way to split your code into manageable chunks.
Since Next.js supports dynamic imports with SSR, you could do amazing things with it.

Here are a few ways to use dynamic imports.

#### 1. Basic Usage (Also does SSR)

```js
import dynamic from 'next/dynamic'
const DynamicComponent = dynamic(import('../components/hello'))

export default () => (
  <div>
    <Header />
    <DynamicComponent />
    <p>HOME PAGE is here!</p>
  </div>
)
```

#### 2. With Custom Loading Component

```js
import dynamic from 'next/dynamic'
const DynamicComponentWithCustomLoading = dynamic(
  import('../components/hello2'),
  {
    loading: () => (<p>...</p>)
  }
)

export default () => (
  <div>
    <Header />
    <DynamicComponentWithCustomLoading />
    <p>HOME PAGE is here!</p>
  </div>
)
```

#### 3. With No SSR

```js
import dynamic from 'next/dynamic'
const DynamicComponentWithNoSSR = dynamic(
  import('../components/hello3'),
  { ssr: false }
)

export default () => (
  <div>
    <Header />
    <DynamicComponentWithNoSSR />
    <p>HOME PAGE is here!</p>
  </div>
)
```

#### 4. With Multiple Modules At Once

```js
import dynamic from 'next/dynamic'

const HelloBundle = dynamic({
  modules: (props) => {
    const components = {
      Hello1: import('../components/hello1'),
      Hello2: import('../components/hello2')
    }

    // Add remove components based on props

    return components
  },
  render: (props, { Hello1, Hello2 }) => (
    <div>
      <h1>{props.title}</h1>
      <Hello1 />
      <Hello2 />
    </div>
  )
})

export default () => (
  <HelloBundle title="Dynamic Bundle"/>
)
```

### Custom `<Document>`

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-styled-components">Styled components custom document</a></li></ul>
  <ul><li><a href="./examples/with-amp">Google AMP</a></li></ul>
</details></p>

Pages in `Next.js` skip the definition of the surrounding document's markup. For example, you never include `<html>`, `<body>`, etc. To override that default behavior, you must create a file at `./pages/_document.js`, where you can extend the `Document` class:

```jsx
// ./pages/_document.js
import Document, { Head, Main, NextScript } from 'next/document'
import flush from 'styled-jsx/server'

export default class MyDocument extends Document {
  static getInitialProps ({ renderPage }) {
    const {html, head, errorHtml, chunks} = renderPage()
    const styles = flush()
    return { html, head, errorHtml, chunks, styles }
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

__Note: React-components outside of `<Main />` will not be initialised by the browser. If you need shared components in all your pages (like a menu or a toolbar), do _not_ add application logic  here, but take a look at [this example](https://github.com/zeit/next.js/tree/master/examples/layout-component).__

### Custom error handling

404 or 500 errors are handled both client and server side by a default component `error.js`. If you wish to override it, define a `_error.js` in the pages folder:

```jsx
import React from 'react'
export default class Error extends React.Component {
  static getInitialProps ({ res, jsonPageRes }) {
    const statusCode = res ? res.statusCode : (jsonPageRes ? jsonPageRes.status : null)
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

For custom advanced behavior of Next.js, you can create a `next.config.js` in the root of your project directory (next to `pages/` and `package.json`).

Note: `next.config.js` is a regular Node.js module, not a JSON file. It gets used by the Next server and build phases, and not included in the browser build.

```javascript
// next.config.js
module.exports = {
  /* config options here */
}
```

#### Setting a custom build directory

You can specify a name to use for a custom build directory. For example, the following config will create a `build` folder instead of a `.next` folder. If no configuration is specified then next will create a `.next` folder.

```javascript
// next.config.js
module.exports = {
  distDir: 'build'
}
```

### Customizing webpack config

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-webpack-bundle-analyzer">Custom webpack bundle analyzer</a></li></ul>
</details></p>

In order to extend our usage of `webpack`, you can define a function that extends its config via `next.config.js`.

```js
// This file is not going through babel transformation.
// So, we write it in vanilla JS
// (But you could use ES2015 features supported by your Node.js version)

module.exports = {
  webpack: (config, { dev }) => {
    // Perform customizations to webpack config

    // Important: return the modified config
    return config
  },
  webpackDevMiddleware: (config) => {
    // Perform customizations to webpack dev middleware config

    // Important: return the modified config
    return config
  }
}
```

*Warning: Adding loaders to support new file types (css, less, svg, etc.) is __not__ recommended because only the client code gets bundled via webpack and thus it won't work on the initial server rendering. Babel plugins are a good alternative because they're applied consistently between server/client rendering (e.g. [babel-plugin-inline-react-svg](https://github.com/kesne/babel-plugin-inline-react-svg)).*

### Customizing babel config

<p><details>
  <summary><b>Examples</b></summary>
  <ul><li><a href="./examples/with-custom-babel-config">Custom babel configuration</a></li></ul>
</details></p>

In order to extend our usage of `babel`, you can simply define a `.babelrc` file at the root of your app. This file is optional.

If found, we're going to consider it the *source of truth*, therefore it needs to define what next needs as well, which is the `next/babel` preset.

This is designed so that you are not surprised by modifications we could make to the babel configurations.

Here's an example `.babelrc` file:

```js
{
  "presets": [
    "next/babel",
    "stage-0"
  ],
}
```

### CDN support with Asset Prefix

To set up a CDN, you can set up the `assetPrefix` setting and configure your CDN's origin to resolve to the domain that Next.js is hosted on.

```js
const isProd = process.env.NODE_ENV === 'production'
module.exports = {
  // You may only need to add assetPrefix in the production.
  assetPrefix: isProd ? 'https://cdn.mydomain.com' : ''
}
```

Note: Next.js will automatically use that prefix the scripts it loads, but this has no effect whatsoever on `/static`. If you want to serve those assets over the CDN, you'll have to introduce the prefix yourself. One way of introducing a prefix that works inside your components and varies by environment is documented [in this example](https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration).

## Production deployment

To deploy, instead of running `next`, you want to build for production usage ahead of time. Therefore, building and starting are separate commands:

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

Next.js can be deployed to other hosting solutions too. Please have a look at the ['Deployment'](https://github.com/zeit/next.js/wiki/Deployment) section of the wiki.

Note: we recommend putting `.next`, or your custom dist folder (Please have a look at ['Custom Config'](https://github.com/zeit/next.js#custom-configuration). You can set a custom folder in config, `.npmignore`, or `.gitignore`. Otherwise, use `files` or `now.files` to opt-into a whitelist of files you want to deploy (and obviously exclude `.next` or your custom dist folder).

## Static HTML export

This is a way to run your Next.js app as a standalone static app without any Node.js server. The export app supports almost every feature of Next.js including dynamic urls, prefetching, preloading and dynamic imports.

### Usage

Simply develop your app as you normally do with Next.js. Then create a custom Next.js [config](https://github.com/zeit/next.js#custom-configuration) as shown below:

```js
// next.config.js
module.exports = {
  exportPathMap: function () {
    return {
      "/": { page: "/" },
      "/about": { page: "/about" },
      "/p/hello-nextjs": { page: "/post", query: { title: "hello-nextjs" } },
      "/p/learn-nextjs": { page: "/post", query: { title: "learn-nextjs" } },
      "/p/deploy-nextjs": { page: "/post", query: { title: "deploy-nextjs" } }
    }
  },
}
```

In that, you specify what are the pages you need to export as static HTML.

Then simply run these commands:

```sh
next build
next export
```

For that you may need to add a NPM script to `package.json` like this:

```json
{
    "scripts": {
        "build": "next build && next export"
    }
}
```

And run it at once with:

```sh
npm run build
```

Then you've a static version of your app in the “out" directory.

> You can also customize the output directory. For that run `next export -h` for the help.

Now you can deploy that directory to any static hosting service. Note that there is an additional step for deploying to GitHub Pages, [documented here](https://github.com/zeit/next.js/wiki/Deploying-a-Next.js-app-into-GitHub-Pages).

For an example, simply visit the “out” directory and run following command to deploy your app to [ZEIT now](https://zeit.co/now).

```sh
now
```

### Limitation

With next export, we build HTML version of your app when you run the command `next export`. In that time, we'll run the `getInitialProps` functions of your pages.

So, you could only use `pathname`, `query` and `asPath` fields of the `context` object passed to `getInitialProps`. You can't use `req` or `res` fields.

> Basically, you won't be able to render HTML content dynamically as we pre-build HTML files. If you need that, you need run your app with `next start`.


## Recipes

- [Setting up 301 redirects](https://www.raygesualdo.com/posts/301-redirects-with-nextjs/)

## FAQ

<details>
  <summary>Is this production ready?</summary>
  Next.js has been powering https://zeit.co since its inception.

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
- Routing with lazy component loading: `<Link>` (by importing `next/link`)
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
  <summary>Can I use it with GraphQL?</summary>

Yes! Here's an example with [Apollo](./examples/with-apollo).

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

## Contributing

Please see our [contributing.md](./contributing.md)

## Authors

- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) – ▲ZEIT
- Tony Kovanen ([@tonykovanen](https://twitter.com/tonykovanen)) – ▲ZEIT
- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) – ▲ZEIT
- Dan Zajdband ([@impronunciable](https://twitter.com/impronunciable)) – Knight-Mozilla / Coral Project
- Tim Neutkens ([@timneutkens](https://github.com/timneutkens))
