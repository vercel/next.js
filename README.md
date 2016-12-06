<img width="112" alt="screen shot 2016-10-25 at 2 37 27 pm" src="https://cloud.githubusercontent.com/assets/13041/19686250/971bf7f8-9ac0-11e6-975c-188defd82df1.png">

[![Build Status](https://travis-ci.org/zeit/next.js.svg?branch=master)](https://travis-ci.org/zeit/next.js)
[![Coverage Status](https://coveralls.io/repos/zeit/next.js/badge.svg?branch=master)](https://coveralls.io/r/zeit/next.js?branch=master)
[![Slack Channel](https://zeit-slackin.now.sh/badge.svg)](https://zeit.chat)

Next.js is a minimalistic framework for server-rendered React applications.

```
npm install next --save
```

## How to create a new Next.js project

1. Copy and paste this into your terminal:
  ```bash
  mkdir nextapp &&
  cd nextapp &&
  echo '{
    "scripts": {
      "dev": "next"
    },
    "dependencies": {
      "next": "latest"
    }
  }' > package.json
  ```

2. Install with [npm](https://www.npmjs.com/get-npm) or [yarn](https://yarnpkg.com/en/docs/install):
  ```
  npm install
  ```

## How to use

The file-system is the main API. Every `.js` file becomes a route that gets automatically processed and rendered.

1. Create a new file containing the following text at `./pages/index.js`:
  ```jsx
  // ./pages/index.js
  import React from 'react'
  export default () => (
    <div>Welcome to next.js!</div>
  )
  ```

2. Run `npm run dev` then go to [http://localhost:3000](http://localhost:3000)

3. At some point, you'll want to add the `.next` build directory to `.npmignore` or `.gitignore`.

### So far, we get:

- Automatic transpilation and bundling (with webpack and babel)
- Hot code reloading
- Server rendering and indexing of `./pages`
- Static file serving. `./static/` is mapped to `/static/`

To see how simple this is, check out the [nextgram sample app](https://github.com/zeit/nextgram).

### Bundling (code splitting)

Every `import` you declare gets bundled and served with each page

```jsx
import React from 'react'
import cowsay from 'cowsay-browser'
export default () => (
  <pre>{ cowsay.say({ text: 'hi there!' }) }</pre>
)
```

That means pages never load unnecessary code!

### CSS

We use [glamor](https://github.com/threepointone/glamor) to provide a great built-in solution for CSS isolation and modularization without trading off any CSS features.

Glamor's [HowTo](https://github.com/threepointone/glamor/blob/master/docs/howto.md) shows converting various CSS use cases to Glamor. See Glamor's [API docs](https://github.com/threepointone/glamor/blob/master/docs/api.md) for more details.

```jsx
import React from 'react'
import css from 'next/css'

export default () => (
  <div className={style}>
    Hello world
  </div>
)

const style = css({
  background: 'red',
  ':hover': {
    background: 'gray'
  },
  '@media (max-width: 600px)': {
    background: 'blue'
  }
})
```

### Images and other static files

Create a folder called `static` in your project root directory. From your code you can then reference those files with `/static/` URLs, e.g.: `<img src="/static/file-name.jpg" />`.

### `<head>` side effects

We expose a built-in component for appending elements to the `<head>` of the page.

```jsx
import React from 'react'
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

### Component lifecycle

When you need state, lifecycle hooks or **initial data population** you can export a `React.Component`.

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

For the initial page load, `getInitialProps` will execute on the server only. `getInitialProps` will only be executed on the client when navigating to a different route via the `Link` component and the `props.url`.

`getInitialProps` receives a context object with the following properties:

- `pathname` - path section of URL
- `query` - query string section of URL parsed as an object
- `req` - HTTP request object (server only)
- `res` - HTTP response object (server only)
- `xhr` - XMLHttpRequest object (client only)
- `err` - Error object if any error is encountered during the rendering

### Routing

Client-side transitions between routes are enabled via a `<Link>` component

#### ./pages/index.js

```jsx
import React from 'react'
import Link from 'next/link'
export default () => (
  <div>Click <Link href="/about"><a>here</a></Link> to read more</div>
)
```

#### ./pages/about.js

```jsx
import React from 'react'
export default () => (
  <p>Welcome to About!</p>
)
```

Client-side routing behaves exactly like the native UA:

1. The component is fetched
2. If it defines `getInitialProps`, data is fetched. If an error occurs, `_error.js` is rendered
3. After 1 and 2 complete, `pushState` is performed and the new component rendered

Each top-level component receives a `url` property with the following API:

- `pathname` - `String` of the current path excluding the query string
- `query` - `Object` with the parsed query string. Defaults to `{}`
- `push(url)` - performs a `pushState` call associated with the current component
- `replace(url)` - performs a `replaceState` call associated with the current component
- `pushTo(url)` - performs a `pushState` call that renders the new `url`. This is equivalent to following a `<Link>`
- `replaceTo(url)` - performs a `replaceState` call that renders the new `url`

### Error handling

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
      ]</p>
    )
  }
}
```

## Production deployment

For production, instead of using the all-in-one `next` development command, use `next build` and `next start`.

For example, this `package.json` is recommended for deploying with services like [`now`](https://zeit.co/now):

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

**Note:** we recommend adding the `.next` build directory to `.npmignore` or `.gitignore`. Otherwise, use `files` or `now.files` to opt-into a whitelist of files you want to deploy (and obviously exclude `.next`)

## FAQ

<details>
  <summary>Is this production ready?</summary>
  Next.js has been powering `https://zeit.co` since its inception.

  We’re ecstatic about both the developer experience and end-user performance, so we decided to share it with the community.
</details>

<details>
  <summary>How big is it?</summary>

The client side next bundle, which includes React and Glamor is **73kb** gzipped.

The Next runtime (lazy loading, routing, `<Head>`) contributes around **15%** to the size of that bundle.

The codebase is ~1500LOC (excluding CLI programs).

</details>

<details>
  <summary>Is this like `create-react-app`?</summary>

Yes and No.

Yes in that both make your life easier.

No in that it enforces a _structure_ so we can do more advanced things like:
- Server side rendering
- Automatic code splitting

In addition, Next.js provides two built-in features that are critical for every single website:
- Routing with lazy component loading: `<Link>` (by importing `next/link`)
- A way for components to alter `<head>`: `<Head>` (by importing `next/head`)

If you want to create re-usable React components you can embed in your Next.js app or other React applications, using `create-react-app` is a great idea. You can later `import` it and keep your codebase clean!

</details>

<details>
  <summary>Why CSS-in-JS?</summary>

`next/css` is powered by [Glamor](https://github.com/threepointone/glamor). While it exposes a JavaScript API, it produces regular CSS and therefore important features like `:hover`, animations, media queries all work.

There’s *no tradeoff* in power. Instead, we gain the power of simpler composition and usage of JavaScript expressions.

*Compiling* regular CSS files would be counter-productive to some of our goals. Some of these are listed below.

**Please note**: we are very interested in supporting regular CSS, since it's so much easier to write and already familiar. To that end, we're currently exploring the possibility of leveraging Shadow DOM to avoid the entire CSS parsing and mangling step [[#22](https://github.com/zeit/next.js/issues/22)]

### Compilation performance

Parsing, prefixing, modularizing and hot-code-reloading CSS can be avoided by just using JavaScript.

This results in better compilation performance and less memory usage (especially for large projects). No `cssom`, `postcss`, `cssnext` or transformation plugins.

It also means fewer dependencies and fewer things for Next to do. Everything is Just JavaScript® (since JSX is completely optional)

### Lifecycle performance

Since every class name is invoked with the `css()` helper, Next.js can intelligently add or remove `<style>` elements that are not being used.

This is important for server-side rendering, but also during the lifecycle of the page. Since Next.js enables `pushState` transitions that load components dynamically, unnecessary `<style>` elements would bring down performance over time.

This is a very significant benefit over approaches like `require(‘xxxxx.css')`.

### Correctness

Since the class names and styles are defined as JavaScript objects, a variety of aids for correctness are much more easily enabled:

- Linting
- Type checking
- Autocompletion

While these are tractable for CSS itself, we don’t need to duplicate the efforts in tooling and libraries to accomplish them.

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

As a result, we were able to introduce a very simple approach to routing consisting of two pieces:

- Every top level component receives a `url` object to inspect the url or perform modifications to the history
- A `<Link />` component is used to wrap elements like anchors (`<a/>`) to perform client-side transitions

We tested the flexibility of the routing with some interesting scenarios. For an example, check out [nextgram](https://github.com/zeit/nextgram).

</details>

<details>
<summary>How do I define a custom fancy route?</summary>

We’re adding the ability to map between an arbitrary URL and any component by supplying a request handler: [#25](https://github.com/zeit/next.js/issues/25)

On the client side, we'll add a parameter to `<Link>` so it _decorates_ the URL differently from the URL it _fetches_.
</details>

<details>
<summary>How do I fetch data?</summary>

It’s up to you. `getInitialProps` is an `async` function (or a regular function that returns a `Promise`). It can retrieve data from anywhere.
</details>

<details>
<summary>Can I use it with Redux?</summary>

Yes! Here's an [example](https://github.com/zeit/next.js/wiki/Redux-example)
</details>

<details>
<summary>Why does it load the runtime from a CDN by default?</summary>

We intend for Next.js to be a great starting point for any website or app, no matter how small.

If you’re building a very small mostly-content website, you still want to benefit from features like lazy-loading, a component architecture and module bundling.

But in some cases, the size of React itself would far exceed the content of the page!

For this reason we want to promote a situation where users can share the cache for the basic runtime across internet properties. The application code continues to load from your server as usual.

We are committed to providing a great uptime and levels of security for our CDN. Even so, we also **automatically fall back** if the CDN script fails to load [with a simple trick](http://www.hanselman.com/blog/CDNsFailButYourScriptsDontHaveToFallbackFromCDNToLocalJQuery.aspx).

To turn the CDN off, just set `{ “next”: { “cdn”: false } }` in `package.json`.
</details>

<details>
<summary>What is this inspired by?</summary>

Many of the goals we set out to accomplish were the ones listed in [The 7 principles of Rich Web Applications](http://rauchg.com/2014/7-principles-of-rich-web-applications/) by Guillermo Rauch.

The ease-of-use of PHP is a great inspiration. We feel Next.js is a suitable replacement for many scenarios where you otherwise would use PHP to output HTML.

Unlike PHP, we benefit from the ES6 module system and every file exports a **component or function** that can be easily imported for lazy evaluation or testing.

As we were researching options for server-rendering React that didn’t involve a large number of steps, we came across [react-page](https://github.com/facebookarchive/react-page) (now deprecated), a similar approach to Next.js by the creator of React Jordan Walke.

</details>

## Background & Design Philosophy

See [the announcement blog post](https://zeit.co/blog/next).

## Future directions

The following issues are currently being explored and input from the community is appreciated:

- Support for pluggable renderers [[#20](https://github.com/zeit/next.js/issues/20)]
- Style isolation through Shadow DOM or "full css support" [[#22](https://github.com/zeit/next.js/issues/22)]
- Better JSX [[#22](https://github.com/zeit/next.js/issues/23)]
- Programmatic API [[#291](https://github.com/zeit/next.js/issues/291)]
- Custom babel config [[#26](https://github.com/zeit/next.js/issues/26)]
- Custom webpack config [[#40](https://github.com/zeit/next.js/issues/40)]

## Contribute

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device
2. Install the dependencies: `npm install`
3. Build and test the code: `npm test`

After that, you'll see the binaries in the `./dist/` folder.

## Authors

- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) – ▲ZEIT
- Tony Kovanen ([@tonykovanen](https://twitter.com/tonykovanen)) – ▲ZEIT
- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) – ▲ZEIT
- Dan Zajdband ([@impronunciable](https://twitter.com/impronunciable)) – Knight-Mozilla / Coral Project
