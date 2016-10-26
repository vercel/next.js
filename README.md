<img width="112" alt="screen shot 2016-10-25 at 2 37 27 pm" src="https://cloud.githubusercontent.com/assets/13041/19686250/971bf7f8-9ac0-11e6-975c-188defd82df1.png">

Next.js is a minimalistic framework for server-rendered React applications.

## How to use

Install it:

```
$ npm install next --save
```

and add a script to your package.json like this:

```json
{
  "scripts": {
    "start": "next"
  }
}
```

After that, the file-system is the main API. Every `.js` file becomes a route that gets automatically processed and rendered.

Populate `./pages/index.js` inside your project:

```jsx
import React from 'react'
export default () => (
  <div>Welcome to next.js!</div>
)
```

and then just run `npm start` and go to `http://localhost:3000`

So far, we get:

- Automatic transpilation and bundling (with webpack and babel)
- Hot code reloading
- Server rendering and indexing of `./pages`
- Static file serving. `./static/` is mapped to `/static/`

To see how simple this is, check out the [sample app - nextgram](https://github.com/zeit/nextgram)

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

We use [glamor](https://github.com/threepointone/glamor) to provide a great built-in solution for CSS isolation and modularization without trading off any CSS features

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

When you need state, lifecycle hooks or **initial data population** you can export a `React.Component`:

```jsx
import React from 'react'
export default class extends React.Component {
  static async getInitialProps ({ req }) {
    return req
      ? { userAgent: req.headers.userAgent }
      : { userAgent: navigator.userAgent }
  }
  render () {
    return <div>
      Hello World {this.props.userAgent}
    </div>
  }
}
```

### Routing

Client-side transitions between routes are enabled via a `<Link>` component

#### pages/index.js

```jsx
import React from 'react'
import Link from 'next/link'
export default () => (
  <div>Click <Link href="/about"><a>here</a></Link> to read more</div>
)
```

#### pages/about.js

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
    const statusCode = res ? res.statusCode : xhr.status
    return { statusCode }
  }

  render () {
    return (
      <p>An error { this.props.statusCode } occurred</p>
    )
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

The client side next bundle, which includes React and Glamor is **73kb** gzipped.

The Next runtime (lazy loading, routing, `<Head>`) contributes around **15%** to the size of that bundle.

The codebase is ~1500LOC (excluding CLI programs).

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
  <summary>Why CSS-in-JS?</summary>

`next/css` is powered by [Glamor](https://github.com/threepointone/glamor). While it exposes a JavaScript API, it produces regular CSS and therefore important features like `:hover`, animations, media queries all work.

There’s *no tradeoff* in power. Instead, we gain the power of simpler composition and usage of JavaScript expressions.

*Compiling* regular CSS files would be counter-productive to some of our goals. Some of these are listed below.

**Please note**: we are very interested in supporting regular CSS, since it's so much easier to write and already familiar. To that end, we're currently exploring the possibility of leveraging Shadow DOM to avoid the entire CSS parsing and mangling step [[#22](https://github.com/zeit/next.js/issues/22)]

### Compilation performance

Parsing, prefixing, modularizing and hot-code-reloading CSS can be avoided by just using JavaScript.

This results in better compilation performance and less memory usage, specially for large projects. No `cssom`, `postcss`, `cssnext` or transformation plugins.

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

See [this](link to default babel config we use) and [this](link to issue that tracks the ability to change babel options)

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

We’re adding the ability to map between an arbitrary URL and any component by supplying a request handler: [#25](https://github.com/zeit/next.js/issues/25)

On the client side, we'll add a parameter to `<Link>` so that it _decorates_ the URL differently from the URL it _fetches_.
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

## Future directions

The following issues are currently being explored and input from the community is appreciated:

- Support for pluggable renderers [[#20](https://github.com/zeit/next.js/issues/20)]
- Style isolation through Shadow DOM or "full css support" [[#22](https://github.com/zeit/next.js/issues/22)]
- Better JSX [[#22](https://github.com/zeit/next.js/issues/23)]
- Custom server logic and routing [[#25](https://github.com/zeit/next.js/issues/25)]
- Custom babel config [[#26](https://github.com/zeit/next.js/issues/26)]
- Custom webpack config [[#40](https://github.com/zeit/next.js/issues/40)]

## Authors

- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) – ▲ZEIT
- Tony Kovanen ([@tonykovanen](https://twitter.com/tonykovanen)) – ▲ZEIT
- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) – ▲ZEIT
- Dan Zajdband ([@impronunciable](https://twitter.com/impronunciable)) – Knight-Mozilla / Coral Project
