[![Next.js](https://assets.zeit.co/image/upload/v1538361091/repositories/next-js/next-js.png)](https://nextjs.org)

[![NPM version](https://img.shields.io/npm/v/next.svg)](https://www.npmjs.com/package/next)
[![Build Status](https://travis-ci.org/zeit/next.js.svg?branch=master)](https://travis-ci.org/zeit/next.js)
[![Build Status](https://dev.azure.com/nextjs/next.js/_apis/build/status/zeit.next.js)](https://dev.azure.com/nextjs/next.js/_build/latest?definitionId=3)
[![Join the community on Spectrum](https://withspectrum.github.io/badge/badge.svg)](https://spectrum.chat/next-js)

**Visit [nextjs.org/learn](https://nextjs.org/learn) to get started with Next.js.**

---

**The below readme is the documentation for the `canary` (prerelease) branch. To view the documentation for the latest stable Next.js version visit [nextjs.org/docs](https://nextjs.org/docs).**

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
    - [Importing CSS / Sass / Less / Stylus files](#importing-css--sass--less--stylus-files)
  - [Static file serving (e.g.: images)](#static-file-serving-eg-images)
  - [Dynamic Routing](#dynamic-routing)
  - [Populating `<head>`](#populating-head)
  - [Fetching data and component lifecycle](#fetching-data-and-component-lifecycle)
  - [Routing](#routing)
    - [With `<Link>`](#with-link)
      - [With URL object](#with-url-object)
      - [Replace instead of push url](#replace-instead-of-push-url)
      - [Using a component that supports `onClick`](#using-a-component-that-supports-onclick)
      - [Forcing the Link to expose `href` to its child](#forcing-the-link-to-expose-href-to-its-child)
      - [Disabling the scroll changes to top on page](#disabling-the-scroll-changes-to-top-on-page)
    - [Imperatively](#imperatively)
    - [Intercepting `popstate`](#intercepting-popstate)
      - [With URL object](#with-url-object-1)
      - [Router Events](#router-events)
      - [Shallow Routing](#shallow-routing)
    - [useRouter](#userouter)
    - [Using a Higher Order Component](#using-a-higher-order-component)
  - [Prefetching Pages](#prefetching-pages)
    - [With `<Link>`](#with-link-1)
    - [Imperatively](#imperatively-1)
  - [API Routes](#api-routes)
    - [Dynamic routes support](#dynamic-routes-support)
    - [API Middlewares](#api-middlewares)
    - [Helper Functions](#helper-functions)
  - [Custom server and routing](#custom-server-and-routing)
    - [Disabling file-system routing](#disabling-file-system-routing)
    - [Dynamic assetPrefix](#dynamic-assetprefix)
  - [Dynamic Import](#dynamic-import)
    - [Basic Usage (Also does SSR)](#basic-usage-also-does-ssr)
    - [With named exports](#with-named-exports)
    - [With Custom Loading Component](#with-custom-loading-component)
    - [With No SSR](#with-no-ssr)
  - [Custom `<App>`](#custom-app)
  - [Custom `<Document>`](#custom-document)
    - [Customizing `renderPage`](#customizing-renderpage)
  - [Custom error handling](#custom-error-handling)
  - [Reusing the built-in error page](#reusing-the-built-in-error-page)
  - [Custom configuration](#custom-configuration)
    - [Setting a custom build directory](#setting-a-custom-build-directory)
    - [Disabling etag generation](#disabling-etag-generation)
    - [Configuring the onDemandEntries](#configuring-the-ondemandentries)
    - [Configuring extensions looked for when resolving pages in `pages`](#configuring-extensions-looked-for-when-resolving-pages-in-pages)
    - [Configuring the build ID](#configuring-the-build-id)
    - [Configuring next process script](#configuring-next-process-script)
  - [Customizing webpack config](#customizing-webpack-config)
  - [Customizing babel config](#customizing-babel-config)
  - [Exposing configuration to the server / client side](#exposing-configuration-to-the-server--client-side)
    - [Build-time configuration](#build-time-configuration)
    - [Runtime configuration](#runtime-configuration)
  - [Starting the server on alternative hostname](#starting-the-server-on-alternative-hostname)
  - [CDN support with Asset Prefix](#cdn-support-with-asset-prefix)
- [Automatic Prerendering](#automatic-prerendering)
- [Production deployment](#production-deployment)
  - [Serverless deployment](#serverless-deployment)
    - [One Level Lower](#one-level-lower)
    - [Summary](#summary)
- [Browser support](#browser-support)
- [TypeScript](#typescript)
  - [Exported types](#exported-types)
- [AMP Support](#amp-support)
  - [Enabling AMP Support](#enabling-amp-support)
  - [AMP First Page](#amp-first-page)
  - [Hybrid AMP Page](#hybrid-amp-page)
  - [AMP Page Modes](#amp-page-modes)
  - [AMP Behavior with `next export`](#amp-behavior-with-next-export)
  - [Adding AMP Components](#adding-amp-components)
  - [AMP Validation](#amp-validation)
  - [TypeScript Support](#typescript-support)
- [Static HTML export](#static-html-export)
  - [Usage](#usage)
  - [Limitation](#limitation)
- [Multi Zones](#multi-zones)
  - [How to define a zone](#how-to-define-a-zone)
  - [How to merge them](#how-to-merge-them)
- [Recipes](#recipes)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Authors](#authors)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## How to use

### Setup

Install it:

```bash
npm install --save next react react-dom
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
function Home() {
  return <div>Welcome to Next.js!</div>
}

export default Home
```

and then just run `npm run dev` and go to `http://localhost:3000`. To use another port, you can run `npm run dev -- -p <your port here>`.

So far, we get:

- Automatic transpilation and bundling (with webpack and babel)
- Hot code reloading
- Server rendering and indexing of `./pages/`
- Static file serving. `./static/` is mapped to `/static/` (given you [create a `./static/` directory](#static-file-serving-eg-images) inside your project)

### Automatic code splitting

Every `import` you declare gets bundled and served with each page. That means pages never load unnecessary code!

```jsx
import cowsay from 'cowsay-browser'

function CowsayHi() {
  return <pre>{cowsay.say({ text: 'hi there!' })}</pre>
}

export default CowsayHi
```

### CSS

#### Built-in CSS support

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/basic-css">Basic css</a></li>
  </ul>
</details>

We bundle [styled-jsx](https://github.com/zeit/styled-jsx) to provide support for isolated scoped CSS. The aim is to support "shadow CSS" similar to Web Components, which unfortunately [do not support server-rendering and are JS-only](https://github.com/w3c/webcomponents/issues/71).

```jsx
function HelloWorld() {
  return (
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
}

export default HelloWorld
```

Please see the [styled-jsx documentation](https://www.npmjs.com/package/styled-jsx) for more examples.

#### CSS-in-JS

<details>
  <summary>
    <b>Examples</b>
  </summary>
  <ul>
    <li><a href="/examples/with-styled-components">Styled components</a></li>
    <li><a href="/examples/with-styletron">Styletron</a></li>
    <li><a href="/examples/with-glamor">Glamor</a></li>
    <li><a href="/examples/with-cxs">Cxs</a></li>
    <li><a href="/examples/with-aphrodite">Aphrodite</a></li>
    <li><a href="/examples/with-fela">Fela</a></li>
  </ul>
</details>

It's possible to use any existing CSS-in-JS solution. The simplest one is inline styles:

```jsx
function HiThere() {
  return <p style={{ color: 'red' }}>hi there</p>
}

export default HiThere
```

To use more sophisticated CSS-in-JS solutions, you typically have to implement style flushing for server-side rendering. We enable this by allowing you to define your own [custom `<Document>`](#custom-document) component that wraps each page.

#### Importing CSS / Sass / Less / Stylus files

To support importing `.css`, `.scss`, `.less` or `.styl` files you can use these modules, which configure sensible defaults for server rendered applications.

- [@zeit/next-css](https://github.com/zeit/next-plugins/tree/master/packages/next-css)
- [@zeit/next-sass](https://github.com/zeit/next-plugins/tree/master/packages/next-sass)
- [@zeit/next-less](https://github.com/zeit/next-plugins/tree/master/packages/next-less)
- [@zeit/next-stylus](https://github.com/zeit/next-plugins/tree/master/packages/next-stylus)

### Static file serving (e.g.: images)

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/public-file-serving">Public file serving</a></li>
  </ul>
</details>

Create a folder called `static` in your project root directory. From your code you can then reference those files with `/static/` URLs:

```jsx
function MyImage() {
  return <img src="/static/my-image.png" alt="my image" />
}

export default MyImage
```

<!--
To serve static files from the root directory you can add a folder called `public` and reference those files from the root, e.g: `/robots.txt`.
-->

_Note: Don't name the `static` directory anything else. The names can't be changed and are the only directories that Next.js uses for serving static assets._

### Dynamic Routing

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/dynamic-routing">Dynamic routing</a></li>
  </ul>
</details>

Defining routes by using predefined paths is not always enough for complex applications, in Next.js you can add brackets to a page (`[param]`) to create a dynamic route (a.k.a. url slugs, pretty urls, et al).

Consider the following page `pages/post/[pid].js`:

```jsx
import { useRouter } from 'next/router'

const Post = () => {
  const router = useRouter()
  const { pid } = router.query

  return <p>Post: {pid}</p>
}

export default Post
```

Any route like `/post/1`, `/post/abc`, etc will be matched by `pages/post/[pid].js`.
The matched path parameter will be sent as a query parameter to the page.

> Note: A `<Link>` for a Dynamic Route looks like so:
>
> ```jsx
> <Link href="/post/[pid]" as="/post/abc">
>   <a>First Post</a>
> </Link>
> ```
>
> You can [read more about `<Link>` here](#with-link).

For example, the route `/post/1` will have the following `query` object: `{ pid: '1' }`.
Similarly, the route `/post/abc?foo=bar` will have the `query` object: `{ foo: 'bar', pid: 'abc' }`.

However, if a query and route param name are the same, route parameters will override the matching query params.
For example, `/post/abc?pid=bcd` will have the `query` object: `{ pid: 'abc' }`.

> **Note**: Predefined routes take precedence over dynamic routes.
> For example, if you have `pages/post/[pid].js` and `pages/post/create.js`, the route `/post/create` will be matched by `pages/post/create.js` instead of the dynamic route (`[pid]`).

> **Note**: Pages that are statically optimized by [automatic prerendering](#automatic-prerendering) will be hydrated without their route parameters provided (`query` will be empty, i.e. `{}`).
> After hydration, Next.js will trigger an update to your application to provide the route parameters in the `query` object.
> If your application cannot tolerate this behavior, you can opt-out of static optimization by capturing the query parameter in `getInitialProps`.

### Populating `<head>`

<details>
<summary><b>Examples</b></summary>
<ul>
 <li><a href="/examples/head-elements">Head elements</a></li>
 <li><a href="/examples/layout-component">Layout component</a></li>
</ul>
</details>

We expose a built-in component for appending elements to the `<head>` of the page.

```jsx
import Head from 'next/head'

function IndexPage() {
  return (
    <div>
      <Head>
        <title>My page title</title>
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      </Head>
      <p>Hello world!</p>
    </div>
  )
}

export default IndexPage
```

To avoid duplicate tags in your `<head>` you can use the `key` property, which will make sure the tag is only rendered once:

```jsx
import Head from 'next/head'

function IndexPage() {
  return (
    <div>
      <Head>
        <title>My page title</title>
        <meta
          name="viewport"
          content="initial-scale=1.0, width=device-width"
          key="viewport"
        />
      </Head>
      <Head>
        <meta
          name="viewport"
          content="initial-scale=1.2, width=device-width"
          key="viewport"
        />
      </Head>
      <p>Hello world!</p>
    </div>
  )
}

export default IndexPage
```

In this case only the second `<meta name="viewport" />` is rendered.

_Note: The contents of `<head>` get cleared upon unmounting the component, so make sure each page completely defines what it needs in `<head>`, without making assumptions about what other pages added._

_Note: `<title>` and `<meta>` elements need to be contained as **direct** children of the `<Head>` element, or wrapped into maximum one level of `<React.Fragment>`, otherwise the metatags won't be correctly picked up on clientside navigation._

### Fetching data and component lifecycle

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/data-fetch">Data fetch</a></li>
  </ul>
</details>

When you need state, lifecycle hooks or **initial data population** you can export a [React.Component](https://reactjs.org/docs/react-component.html) or use a stateless function and [Hooks](https://reactjs.org/docs/hooks-intro.html).

Using a stateless function:

```jsx
function Page({ stars }) {
  return <div>Next stars: {stars}</div>
}

Page.getInitialProps = async ({ req }) => {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const json = await res.json()
  return { stars: json.stargazers_count }
}

export default Page
```

Using `React.Component`:

```jsx
import React from 'react'

class HelloUA extends React.Component {
  static async getInitialProps({ req }) {
    const userAgent = req ? req.headers['user-agent'] : navigator.userAgent
    return { userAgent }
  }

  render() {
    return <div>Hello World {this.props.userAgent}</div>
  }
}

export default HelloUA
```

Notice that to load data when the page loads, we use `getInitialProps` which is an [`async`](https://zeit.co/blog/async-and-await) static method. It can asynchronously fetch anything that resolves to a JavaScript plain `Object`, which populates `props`.

Data returned from `getInitialProps` is serialized when server rendering, similar to a `JSON.stringify`. Make sure the returned object from `getInitialProps` is a plain `Object` and not using `Date`, `Map` or `Set`.

For the initial page load, `getInitialProps` will execute on the server only. `getInitialProps` will only be executed on the client when navigating to a different route via the `Link` component or using the routing APIs.

<br/>

> - `getInitialProps` can **not** be used in children components. Only in `pages`.
> - If you are using some server only modules inside `getInitialProps`, make sure to [import them properly](https://arunoda.me/blog/ssr-and-server-only-modules), otherwise, it'll slow down your app.

<br/>

`getInitialProps` receives a context object with the following properties:

- `pathname` - path section of URL
- `query` - query string section of URL parsed as an object
- `asPath` - `String` of the actual path (including the query) shows in the browser
- `req` - HTTP request object (server only)
- `res` - HTTP response object (server only)
- `err` - Error object if any error is encountered during the rendering

### Routing

Next.js does not ship a routes manifest with every possible route in the application, so the current page is not aware of any other pages on the client side. All subsequent routes get lazy-loaded, for scalability sake.

#### With `<Link>`

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/hello-world">Hello World</a></li>
  </ul>
</details>

Client-side transitions between routes can be enabled via a `<Link>` component.

> This component is not required for navigations to static pages that require a hard refresh, like when using [AMP](#amp-support).

**Basic Example**

Consider these two pages:

```jsx
// pages/index.js
import Link from 'next/link'

function Home() {
  return (
    <>
      <ul>
        <li>Home</li>
        <li>
          <Link href="/about">
            <a>About Us</a>
          </Link>
        </li>
      </ul>

      <h1>This is our homepage.</h1>
    </>
  )
}

export default Home
```

```jsx
// pages/about.js
function About() {
  return (
    <>
      <ul>
        <li>
          <Link href="/">
            <a>Home</a>
          </Link>
        </li>
        <li>About Us</li>
      </ul>

      <h1>About</h1>
      <p>We are a cool company.</p>
    </>
  )
}

export default About
```

**Dynamic Routes**

`<Link>` component has two relevant props when using _Dynamic Routes_:

- `href`: the path inside `pages` directory
- `as`: the path that will be rendered in the browser URL bar

Consider the page `pages/post/[postId].js`:

```jsx
import { useRouter } from 'next/router'

const Post = () => {
  const router = useRouter()
  const { postId } = router.query

  return <p>My Blog Post: {postId}</p>
}

export default Post
```

A link for `/post/first-post` looks like this:

```jsx
<Link href="/post/[postId]" as="/post/first-post">
  <a>First Post</a>
</Link>
```

**Custom routes (using props from URL)**

If you find that your use case is not covered by [Dynamic Routing](#dynamic-routing) then you can create a custom server and manually add dynamic routes.

Example:

1. Consider you have the URL `/post/:slug`.

2. You created `pages/post.js`:

   ```jsx
   import { useRouter } from 'next/router'

   const Post = () => {
     const router = useRouter()
     const { slug } = router.query

     return <p>My Blog Post: {slug}</p>
   }

   export default Post
   ```

3. You add the route to `express` (or any other server) on `server.js` file (this is only for SSR). This will route the url `/post/:slug` to `pages/post.js` and provide `slug` as part of the `query` object to the page.

   ```jsx
   server.get('/post/:slug', (req, res) => {
     return app.render(req, res, '/post', { slug: req.params.slug })
   })
   ```

4. For client side routing, use `next/link`:
   ```jsx
   <Link href="/post?slug=something" as="/post/something">
   ```

Client-side routing behaves exactly like the browser:

1. The component is fetched.
2. If it defines `getInitialProps`, data is fetched. If an error occurs, `_error.js` is rendered.
3. After 1 and 2 complete, `pushState` is performed and the new component is rendered.

To inject the `pathname`, `query` or `asPath` in your component, you can use the [useRouter](#useRouter) hook, or [withRouter](#using-a-higher-order-component) for class components.

##### With URL object

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-url-object-routing">With URL Object Routing</a></li>
  </ul>
</details>

The component `<Link>` can also receive a URL object and it will automatically format it to create the URL string.

```jsx
// pages/index.js
import Link from 'next/link'

function Home() {
  return (
    <div>
      Click{' '}
      <Link href={{ pathname: '/about', query: { name: 'Zeit' } }}>
        <a>here</a>
      </Link>{' '}
      to read more
    </div>
  )
}

export default Home
```

That will generate the URL string `/about?name=Zeit`, you can use every property as defined in the [Node.js URL module documentation](https://nodejs.org/api/url.html#url_url_strings_and_url_objects).

##### Replace instead of push url

The default behaviour for the `<Link>` component is to `push` a new url into the stack. You can use the `replace` prop to prevent adding a new entry.

```jsx
// pages/index.js
import Link from 'next/link'

function Home() {
  return (
    <div>
      Click{' '}
      <Link href="/about" replace>
        <a>here</a>
      </Link>{' '}
      to read more
    </div>
  )
}

export default Home
```

##### Using a component that supports `onClick`

`<Link>` supports any component that supports the `onClick` event. In case you don't provide an `<a>` tag, it will only add the `onClick` event handler and won't pass the `href` property.

```jsx
// pages/index.js
import Link from 'next/link'

function Home() {
  return (
    <div>
      Click{' '}
      <Link href="/about">
        <img src="/static/image.png" alt="image" />
      </Link>
    </div>
  )
}

export default Home
```

##### Forcing the Link to expose `href` to its child

If child is an `<a>` tag and doesn't have a href attribute we specify it so that the repetition is not needed by the user. However, sometimes, you’ll want to pass an `<a>` tag inside of a wrapper and the `Link` won’t recognize it as a _hyperlink_, and, consequently, won’t transfer its `href` to the child. In cases like that, you should define a boolean `passHref` property to the `Link`, forcing it to expose its `href` property to the child.

**Please note**: using a tag other than `a` and failing to pass `passHref` may result in links that appear to navigate correctly, but, when being crawled by search engines, will not be recognized as links (owing to the lack of `href` attribute). This may result in negative effects on your sites SEO.

```jsx
import Link from 'next/link'
import Unexpected_A from 'third-library'

function NavLink({ href, name }) {
  return (
    <Link href={href} passHref>
      <Unexpected_A>{name}</Unexpected_A>
    </Link>
  )
}

export default NavLink
```

##### Disabling the scroll changes to top on page

The default behaviour of `<Link>` is to scroll to the top of the page. When there is a hash defined it will scroll to the specific id, just like a normal `<a>` tag. To prevent scrolling to the top / hash `scroll={false}` can be added to `<Link>`:

```jsx
<Link scroll={false} href="/?counter=10"><a>Disables scrolling</a></Link>
<Link href="/?counter=10"><a>Changes with scrolling to top</a></Link>
```

#### Imperatively

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/using-router">Basic routing</a></li>
    <li><a href="/examples/with-loading">With a page loading indicator</a></li>
  </ul>
</details>

You can also do client-side page transitions using `next/router`:

```jsx
import Router from 'next/router'

function ReadMore() {
  return (
    <div>
      Click <span onClick={() => Router.push('/about')}>here</span> to read more
    </div>
  )
}

export default ReadMore
```

#### Intercepting `popstate`

In some cases (for example, if using a [custom router](#custom-server-and-routing)), you may wish
to listen to [`popstate`](https://developer.mozilla.org/en-US/docs/Web/Events/popstate) and react before the router acts on it.
For example, you could use this to manipulate the request, or force an SSR refresh.

```jsx
import Router from 'next/router'

Router.beforePopState(({ url, as, options }) => {
  // I only want to allow these two routes!
  if (as !== '/' || as !== '/other') {
    // Have SSR render bad routes as a 404.
    window.location.href = as
    return false
  }

  return true
})
```

If the function you pass into `beforePopState` returns `false`, `Router` will not handle `popstate`;
you'll be responsible for handling it, in that case.
See [Disabling File-System Routing](#disabling-file-system-routing).

Above `Router` object comes with the following API:

- `route` - `String` of the current route
- `pathname` - `String` of the current path excluding the query string
- `query` - `Object` with the parsed query string. Defaults to `{}`.
- `asPath` - `String` of the actual path (including the query) shows in the browser
- `push(url, as=url)` - performs a `pushState` call with the given url
- `replace(url, as=url)` - performs a `replaceState` call with the given url
- `beforePopState(cb=function)` - intercept popstate before router processes the event

The second `as` parameter for `push` and `replace` is an optional _decoration_ of the URL. Useful if you configured custom routes on the server.

##### With URL object

You can use a URL object the same way you use it in a `<Link>` component to `push` and `replace` a URL.

```jsx
import Router from 'next/router'

const handler = () => {
  Router.push({
    pathname: '/about',
    query: { name: 'Zeit' },
  })
}

function ReadMore() {
  return (
    <div>
      Click <span onClick={handler}>here</span> to read more
    </div>
  )
}

export default ReadMore
```

This uses the same exact parameters as [in the `<Link>` component](#with-url-object). The first parameter maps to `href` while the second parameter maps to `as` in the `<Link>` component as documented [here](#with-url-object).

##### Router Events

You can also listen to different events happening inside the Router.
Here's a list of supported events:

- `routeChangeStart(url)` - Fires when a route starts to change
- `routeChangeComplete(url)` - Fires when a route changed completely
- `routeChangeError(err, url)` - Fires when there's an error when changing routes, or a route load is cancelled
- `beforeHistoryChange(url)` - Fires just before changing the browser's history
- `hashChangeStart(url)` - Fires when the hash will change but not the page
- `hashChangeComplete(url)` - Fires when the hash has changed but not the page

> Here `url` is the URL shown in the browser. If you call `Router.push(url, as)` (or similar), then the value of `url` will be `as`.

Here's how to properly listen to the router event `routeChangeStart`:

```js
const handleRouteChange = url => {
  console.log('App is changing to: ', url)
}

Router.events.on('routeChangeStart', handleRouteChange)
```

If you no longer want to listen to that event, you can unsubscribe with the `off` method:

```js
Router.events.off('routeChangeStart', handleRouteChange)
```

If a route load is cancelled (for example by clicking two links rapidly in succession), `routeChangeError` will fire. The passed `err` will contain a `cancelled` property set to `true`.

```js
Router.events.on('routeChangeError', (err, url) => {
  if (err.cancelled) {
    console.log(`Route to ${url} was cancelled!`)
  }
})
```

> **Note**: Using router events in `getInitialProps` is discouraged as it may result in unexpected behavior.<br/>
> Router events should be registered when a component mounts (`useEffect` or `componentDidMount`/`componentWillUnmount`) or imperatively when an event happens.
>
> ```js
> useEffect(() => {
>   const handleRouteChange = url => {
>     console.log('App is changing to: ', url)
>   }
>
>   Router.events.on('routeChangeStart', handleRouteChange)
>   return () => {
>     Router.events.off('routeChangeStart', handleRouteChange)
>   }
> }, [])
> ```

##### Shallow Routing

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-shallow-routing">Shallow Routing</a></li>
  </ul>
</details>

Shallow routing allows you to change the URL without running `getInitialProps`. You'll receive the updated `pathname` and the `query` via the `router` prop (injected by using [`useRouter`](#useRouter) or [`withRouter`](#using-a-higher-order-component)), without losing state.

You can do this by invoking either `Router.push` or `Router.replace` with the `shallow: true` option. Here's an example:

```js
// Current URL is "/"
const href = '/?counter=10'
const as = href
Router.push(href, as, { shallow: true })
```

Now, the URL is updated to `/?counter=10`. You can see the updated URL with `this.props.router.query` inside the `Component` (make sure you are using [`withRouter`](#using-a-higher-order-component) around your `Component` to inject the `router` prop).

You can watch for URL changes via [`componentDidUpdate`](https://reactjs.org/docs/react-component.html#componentdidupdate) hook as shown below:

```js
componentDidUpdate(prevProps) {
  const { pathname, query } = this.props.router
  // verify props have changed to avoid an infinite loop
  if (query.id !== prevProps.router.query.id) {
    // fetch data based on the new query
  }
}
```

> NOTES:
>
> Shallow routing works **only** for same page URL changes. For an example, let's assume we have another page called `about`, and you run this:
>
> ```js
> Router.push('/?counter=10', '/about?counter=10', { shallow: true })
> ```
>
> Since that's a new page, it'll unload the current page, load the new one and call `getInitialProps` even though we asked to do shallow routing.

#### useRouter

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/dynamic-routing">Dynamic routing</a></li>
  </ul>
</details>

If you want to access the `router` object inside any component in your app, you can use the `useRouter` hook, here's how to use it:

```jsx
import { useRouter } from 'next/router'

export default function ActiveLink({ children, href }) {
  const router = useRouter()
  const style = {
    marginRight: 10,
    color: router.pathname === href ? 'red' : 'black',
  }

  const handleClick = e => {
    e.preventDefault()
    router.push(href)
  }

  return (
    <a href={href} onClick={handleClick} style={style}>
      {children}
    </a>
  )
}
```

The above `router` object comes with an API similar to [`next/router`](#imperatively).

#### Using a Higher Order Component

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/using-with-router">Using the `withRouter` utility</a></li>
  </ul>
</details>

If [useRouter](#useRouter) is not the best fit for you, `withRouter` can also add the same `router` object to any component, here's how to use it:

```jsx
import { withRouter } from 'next/router'

function Page({ router }) {
  return <p>{router.pathname}</p>
}

export default withRouter(Page)
```

### Prefetching Pages

⚠️ This is a production only feature ⚠️

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-prefetching">Prefetching</a></li>
  </ul>
</details>

Next.js has an API which allows you to prefetch pages.

Since Next.js server-renders your pages, this allows all the future interaction paths of your app to be instant. Effectively Next.js gives you the great initial download performance of a _website_, with the ahead-of-time download capabilities of an _app_. [Read more](https://zeit.co/blog/next#anticipation-is-the-key-to-performance).

> With prefetching Next.js only downloads JS code. When the page is getting rendered, you may need to wait for the data.

> `<link rel="preload">` is used for prefetching. Sometimes browsers will show a warning if the resource is not used within 3 seconds, these warnings can be ignored as per https://github.com/zeit/next.js/issues/6517#issuecomment-469063892.

#### With `<Link>`

`<Link>` will automatically prefetch pages in the background as they appear in the view. If certain pages are rarely visited you can manually set `prefetch` to `false`, here's how:

```jsx
<Link href="/about" prefetch={false}>
  <a>About</a>
</Link>
```

#### Imperatively

Most prefetching needs are addressed by `<Link />`, but we also expose an imperative API for advanced usage:

```jsx
import { useRouter } from 'next/router'

export default function MyLink() {
  const router = useRouter()

  return (
    <>
      <a onClick={() => setTimeout(() => router.push('/dynamic'), 100)}>
        A route transition will happen after 100ms
      </a>
      {// and we can prefetch it!
      router.prefetch('/dynamic')}
    </>
  )
}
```

`router` methods should be only used inside the client side of your app though. In order to prevent any error regarding this subject use the imperatively `prefetch` method in the `useEffect()` hook:

```jsx
import { useRouter } from 'next/router'

export default function MyLink() {
  const router = useRouter()

  useEffect(() => {
    router.prefetch('/dynamic')
  })

  return (
    <a onClick={() => setTimeout(() => router.push('/dynamic'), 100)}>
      A route transition will happen after 100ms
    </a>
  )
}

export default withRouter(MyLink)
```

You can also add it to the `componentDidMount()` lifecycle method when using `React.Component`:

```jsx
import React from 'react'
import { withRouter } from 'next/router'

class MyLink extends React.Component {
  componentDidMount() {
    const { router } = this.props
    router.prefetch('/dynamic')
  }

  render() {
    const { router } = this.props

    return (
      <a onClick={() => setTimeout(() => router.push('/dynamic'), 100)}>
        A route transition will happen after 100ms
      </a>
    )
  }
}

export default withRouter(MyLink)
```

### API Routes

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/api-routes">Basic API routes</a></li>
    <li><a href="/examples/api-routes-micro">API routes with micro</a></li>
    <li><a href="/examples/api-routes-middleware">API routes with middleware</a></li>
    <li><a href="/examples/api-routes-graphql">API routes with GraphQL server</a></li>
  </ul>
</details>

API routes provides a straightforward solution to build your **API** with Next.js.
Start by creating the `api/` folder inside the `./pages/` folder.

Every file inside `./pages/api` is mapped to `/api/*`.
For example, `./pages/api/posts.js` is mapped to the route `/api/posts`.

Here's an example API route file:

```js
export default (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 200
  res.end(JSON.stringify({ name: 'Nextjs' }))
}
```

- `req` refers to [NextApiRequest](https://github.com/zeit/next.js/blob/v9.0.0/packages/next-server/lib/utils.ts#L143-L158) which extends [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage)

- `res` refers to [NextApiResponse](https://github.com/zeit/next.js/blob/v9.0.0/packages/next-server/lib/utils.ts#L168-L178) which extends [http.ServerResponse](https://nodejs.org/api/http.html#http_class_http_serverresponse)

> **Note**: API Routes [do not specify CORS headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS), so they'll be **same-origin only** by default.
> You can customize this behavior by wrapping your export with CORS middleware.
> We provide an [example of this below](#api-middlewares).

API Routes do not increase your client-side bundle size. They are server-side only bundles.

#### Dynamic routes support

API pages support [dynamic routing](#dynamic-routing), so you can use all benefits mentioned already above.

Consider the following page `./pages/api/post/[pid].js`, here is how you get parameters inside the resolver method:

```js
export default (req, res) => {
  const {
    query: { pid },
  } = req

  res.end(`Post: ${pid}`)
}
```

#### API Middlewares

API routes provides built in middlewares which parse the incoming `req`.
Those middlewares are:

- `req.cookies` - an object containing the cookies sent by the request. Defaults to `{}`
- `req.query` - an object containing the [query string](https://en.wikipedia.org/wiki/Query_string). Defaults to `{}`
- `req.body` - an object containing the body parsed by `content-type`, or `null` if no body is sent

Body parsing is enabled by default.
You can opt-out of automatic body parsing if you need to consume it as a `Stream`:

```js
// ./pages/api/my-endpoint.js
export default (req, res) => {
  // ...
}

export const config = {
  api: {
    bodyParser: false,
  },
}
```

As an added bonus, you can also use any [Micro](https://github.com/zeit/micro) compatible [middleware](https://github.com/amio/awesome-micro)!

For example, [configuring CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) for your API endpoint can be done leveraging `micro-cors`.

First, install `micro-cors`:

```bash
npm i micro-cors
# or
yarn add micro-cors
```

Then, import `micro-cors` and [configure it](https://github.com/possibilities/micro-cors#readme). Finally, wrap your exported function in the middleware:

```js
import Cors from 'micro-cors'

const cors = Cors({
  allowedMethods: ['GET', 'HEAD'],
})

function Endpoint(req, res) {
  res.json({ message: 'Hello Everyone!' })
}

export default cors(Endpoint)
```

#### Helper Functions

We're providing a set of Express.js-like methods to improve the developer experience and increase the speed of creating new API endpoints:

```js
export default (req, res) => {
  res.status(200).json({ name: 'Next.js' })
}
```

- `res.status(code)` - a function to set the status code. `code` must be a valid [HTTP status code](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes)
- `res.json(json)` - Sends a `JSON` response. `json` must be a valid `JSON` object
- `res.send(body)` - Sends the HTTP response. `body` can be a `string`, an `object` or a `Buffer`

### Custom server and routing

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/custom-server">Basic custom server</a></li>
    <li><a href="/examples/custom-server-express">Express integration</a></li>
    <li><a href="/examples/custom-server-hapi">Hapi integration</a></li>
    <li><a href="/examples/custom-server-koa">Koa integration</a></li>
    <li><a href="/examples/parameterized-routing">Parameterized routing</a></li>
    <li><a href="/examples/ssr-caching">SSR caching</a></li>
  </ul>
</details>

Typically you start your next server with `next start`. It's possible, however, to start a server 100% programmatically in order to customize routes, use route patterns, etc.

When using a custom server with a server file, for example called `server.js`, make sure you update the scripts key in `package.json` to:

```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "next build",
    "start": "NODE_ENV=production node server.js"
  }
}
```

This example makes `/a` resolve to `./pages/b`, and `/b` resolve to `./pages/a`:

```js
// This file doesn't go through babel or webpack transformation.
// Make sure the syntax and sources this file requires are compatible with the current node version you are running
// See https://github.com/zeit/next.js/issues/1245 for discussions on Universal Webpack or universal Babel
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
  }).listen(3000, err => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
```

The `next` API is as follows:

- `next(opts: object)`

Supported options:

- `dev` (`bool`) whether to launch Next.js in dev mode - default `false`
- `dir` (`string`) where the Next project is located - default `'.'`
- `quiet` (`bool`) Hide error messages containing server information - default `false`
- `conf` (`object`) the same object you would use in `next.config.js` - default `{}`

Then, change your `start` script to `NODE_ENV=production node server.js`.

#### Disabling file-system routing

By default, `Next` will serve each file in `/pages` under a pathname matching the filename (eg, `/pages/some-file.js` is served at `site.com/some-file`.

If your project uses custom routing, this behavior may result in the same content being served from multiple paths, which can present problems with SEO and UX.

To disable this behavior & prevent routing based on files in `/pages`, simply set the following option in your `next.config.js`:

```js
// next.config.js
module.exports = {
  useFileSystemPublicRoutes: false,
}
```

Note that `useFileSystemPublicRoutes` simply disables filename routes from SSR; client-side routing may still access those paths. If using this option, you should guard against navigation to routes you do not want programmatically.

You may also wish to configure the client-side Router to disallow client-side redirects to filename routes; please refer to [Intercepting `popstate`](#intercepting-popstate).

#### Dynamic assetPrefix

Sometimes we need to set the `assetPrefix` dynamically. This is useful when changing the `assetPrefix` based on incoming requests.
For that, we can use `app.setAssetPrefix`.

Here's an example usage of it:

```js
const next = require('next')
const http = require('http')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = new http.Server((req, res) => {
    // Add assetPrefix support based on the hostname
    if (req.headers.host === 'my-app.com') {
      app.setAssetPrefix('http://cdn.com/myapp')
    } else {
      app.setAssetPrefix('')
    }

    handleNextRequests(req, res)
  })

  server.listen(port, err => {
    if (err) {
      throw err
    }

    console.log(`> Ready on http://localhost:${port}`)
  })
})
```

### Dynamic Import

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-dynamic-import">With Dynamic Import</a></li>
  </ul>
</details>

Next.js supports ES2020 [dynamic `import()`](https://github.com/tc39/proposal-dynamic-import) for JavaScript.
With that, you could import JavaScript modules (inc. React Components) dynamically and work with them.

You can think dynamic imports as another way to split your code into manageable chunks.
Since Next.js supports dynamic imports with SSR, you could do amazing things with it.

Here are a few ways to use dynamic imports.

#### Basic Usage (Also does SSR)

```jsx
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/hello'))

function Home() {
  return (
    <div>
      <Header />
      <DynamicComponent />
      <p>HOME PAGE is here!</p>
    </div>
  )
}

export default Home
```

#### With named exports

```jsx
// components/hello.js
export function Hello() {
  return <p>Hello!</p>
}
```

```jsx
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() =>
  import('../components/hello').then(mod => mod.Hello)
)

function Home() {
  return (
    <div>
      <Header />
      <DynamicComponent />
      <p>HOME PAGE is here!</p>
    </div>
  )
}

export default Home
```

#### With Custom Loading Component

```jsx
import dynamic from 'next/dynamic'

const DynamicComponentWithCustomLoading = dynamic(
  () => import('../components/hello2'),
  { loading: () => <p>...</p> }
)

function Home() {
  return (
    <div>
      <Header />
      <DynamicComponentWithCustomLoading />
      <p>HOME PAGE is here!</p>
    </div>
  )
}

export default Home
```

#### With No SSR

```jsx
import dynamic from 'next/dynamic'

const DynamicComponentWithNoSSR = dynamic(
  () => import('../components/hello3'),
  { ssr: false }
)

function Home() {
  return (
    <div>
      <Header />
      <DynamicComponentWithNoSSR />
      <p>HOME PAGE is here!</p>
    </div>
  )
}

export default Home
```

### Custom `<App>`

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-app-layout">Using `_app.js` for layout</a></li>
    <li><a href="/examples/with-componentdidcatch">Using `_app.js` to override `componentDidCatch`</a></li>
  </ul>
</details>

Next.js uses the `App` component to initialize pages. You can override it and control the page initialization. Which allows you to do amazing things like:

- Persisting layout between page changes
- Keeping state when navigating pages
- Custom error handling using `componentDidCatch`
- Inject additional data into pages (for example by processing GraphQL queries)

To override, create the `./pages/_app.js` file and override the App class as shown below:

```js
import React from 'react'
import App, { Container } from 'next/app'

class MyApp extends App {
  static async getInitialProps({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render() {
    const { Component, pageProps } = this.props

    return (
      <Container>
        <Component {...pageProps} />
      </Container>
    )
  }
}

export default MyApp
```

> **Note:** Adding a custom `getInitialProps` in App will affect [Automatic Prerendering](#automatic-prerendering)

### Custom `<Document>`

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-styled-components">Styled components custom document</a></li>
  </ul>
</details>

A custom `<Document>` is commonly used to augment your application's `<html>` and `<body>` tags.
This is necessary because Next.js pages skip the definition of the surrounding document's markup.

This allows you to support Server-Side Rendering for CSS-in-JS libraries like
[styled-components](/examples/with-styled-components) or [emotion](/examples/with-emotion).
Note, [styled-jsx](https://github.com/zeit/styled-jsx) is included in Next.js by default.

A custom `<Document>` can also include `getInitialProps` for expressing asynchronous server-rendering data requirements.

> **Note**: `<Document>`'s `getInitialProps` function is not called during client-side transitions,
> nor when a page is [automatically prerendered](#automatic-prerendering).

> **Note**: Make sure to check if `ctx.req` / `ctx.res` are defined in `getInitialProps`.
> These variables will be `undefined` when a page is being statically exported for `next export` or [automatic prerendering (static optimization)](#automatic-prerendering).

To use a custom `<Document>`, you must create a file at `./pages/_document.js` and extend the `Document` class:

```jsx
// _document is only rendered on the server side and not on the client side
// Event handlers like onClick can't be added to this file

// ./pages/_document.js
import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
```

All of `<Html>`, `<Head />`, `<Main />` and `<NextScript />` are required for page to be properly rendered.

**Note: React-components outside of `<Main />` will not be initialised by the browser. Do _not_ add application logic here. If you need shared components in all your pages (like a menu or a toolbar), take a look at the [`<App>`](#custom-app) component instead.**

The `ctx` object is equivalent to the one received in all [`getInitialProps`](#fetching-data-and-component-lifecycle) hooks, with one addition:

- `renderPage` (`Function`) a callback that executes the actual React rendering logic (synchronously). It's useful to decorate this function in order to support server-rendering wrappers like Aphrodite's [`renderStatic`](https://github.com/Khan/aphrodite#server-side-rendering).

#### Customizing `renderPage`

🚧 It should be noted that the only reason you should be customizing `renderPage` is for usage with css-in-js libraries
that need to wrap the application to properly work with server-rendering. 🚧

- It takes as argument an options object for further customization:

```js
import Document from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const originalRenderPage = ctx.renderPage

    ctx.renderPage = () =>
      originalRenderPage({
        // useful for wrapping the whole react tree
        enhanceApp: App => App,
        // useful for wrapping in a per-page basis
        enhanceComponent: Component => Component,
      })

    // Run the parent `getInitialProps` using `ctx` that now includes our custom `renderPage`
    const initialProps = await Document.getInitialProps(ctx)

    return initialProps
  }
}

export default MyDocument
```

### Custom error handling

404 or 500 errors are handled both client and server side by a default component `error.js`. If you wish to override it, define a `_error.js` in the pages folder:

⚠️ The `pages/_error.js` component is only used in production. In development you get an error with call stack to know where the error originated from. ⚠️

```jsx
import React from 'react'

class Error extends React.Component {
  static getInitialProps({ res, err }) {
    const statusCode = res ? res.statusCode : err ? err.statusCode : null
    return { statusCode }
  }

  render() {
    return (
      <p>
        {this.props.statusCode
          ? `An error ${this.props.statusCode} occurred on server`
          : 'An error occurred on client'}
      </p>
    )
  }
}

export default Error
```

### Reusing the built-in error page

If you want to render the built-in error page you can by using `next/error`:

```jsx
import React from 'react'
import Error from 'next/error'
import fetch from 'isomorphic-unfetch'

class Page extends React.Component {
  static async getInitialProps() {
    const res = await fetch('https://api.github.com/repos/zeit/next.js')
    const errorCode = res.statusCode > 200 ? res.statusCode : false
    const json = await res.json()

    return { errorCode, stars: json.stargazers_count }
  }

  render() {
    if (this.props.errorCode) {
      return <Error statusCode={this.props.errorCode} />
    }

    return <div>Next stars: {this.props.stars}</div>
  }
}

export default Page
```

> If you have created a custom error page you have to import your own `_error` component from `./_error` instead of `next/error`.

The Error component also takes `title` as a property if you want to pass in a text message along with a `statusCode`.

### Custom configuration

For custom advanced behavior of Next.js, you can create a `next.config.js` in the root of your project directory (next to `pages/` and `package.json`).

Note: `next.config.js` is a regular Node.js module, not a JSON file. It gets used by the Next server and build phases, and not included in the browser build.

```js
// next.config.js
module.exports = {
  /* config options here */
}
```

Or use a function:

```js
module.exports = (phase, { defaultConfig }) => {
  return {
    /* config options here */
  }
}
```

`phase` is the current context in which the configuration is loaded. You can see all phases here: [constants](/packages/next-server/lib/constants.ts)
Phases can be imported from `next/constants`:

```js
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')
module.exports = (phase, { defaultConfig }) => {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      /* development only config options here */
    }
  }

  return {
    /* config options for all phases except development here */
  }
}
```

#### Setting a custom build directory

You can specify a name to use for a custom build directory. For example, the following config will create a `build` folder instead of a `.next` folder. If no configuration is specified then next will create a `.next` folder.

```js
// next.config.js
module.exports = {
  distDir: 'build',
}
```

#### Disabling etag generation

You can disable etag generation for HTML pages depending on your cache strategy. If no configuration is specified then Next will generate etags for every page.

```js
// next.config.js
module.exports = {
  generateEtags: false,
}
```

#### Configuring the onDemandEntries

Next exposes some options that give you some control over how the server will dispose or keep in memories pages built:

```js
module.exports = {
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
}
```

This is development-only feature. If you want to cache SSR pages in production, please see [SSR-caching](https://github.com/zeit/next.js/tree/canary/examples/ssr-caching) example.

#### Configuring extensions looked for when resolving pages in `pages`

Aimed at modules like [`@next/mdx`](https://github.com/zeit/next.js/tree/canary/packages/next-mdx), that add support for pages ending with `.mdx`. `pageExtensions` allows you to configure the extensions looked for in the `pages` directory when resolving pages.

```js
// next.config.js
module.exports = {
  pageExtensions: ['mdx', 'jsx', 'js'],
}
```

#### Configuring the build ID

Next.js uses a constant generated at build time to identify which version of your application is being served. This can cause problems in multi-server deployments when `next build` is ran on every server. In order to keep a static build id between builds you can provide the `generateBuildId` function:

```js
// next.config.js
module.exports = {
  generateBuildId: async () => {
    // For example get the latest git commit hash here
    return 'my-build-id'
  },
}
```

To fall back to the default of generating a unique id return `null` from the function:

```js
module.exports = {
  generateBuildId: async () => {
    // When process.env.YOUR_BUILD_ID is undefined we fall back to the default
    if (process.env.YOUR_BUILD_ID) {
      return process.env.YOUR_BUILD_ID
    }

    return null
  },
}
```

#### Configuring next process script

You can pass any node arguments to `next` CLI command.

```bash
NODE_OPTIONS="--throw-deprecation" next
NODE_OPTIONS="-r esm" next
NODE_OPTIONS="--inspect" next
```

### Customizing webpack config

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-webpack-bundle-analyzer">Custom webpack bundle analyzer</a></li>
  </ul>
</details>

Some commonly asked for features are available as modules:

- [@zeit/next-css](https://github.com/zeit/next-plugins/tree/master/packages/next-css)
- [@zeit/next-sass](https://github.com/zeit/next-plugins/tree/master/packages/next-sass)
- [@zeit/next-less](https://github.com/zeit/next-plugins/tree/master/packages/next-less)
- [@zeit/next-preact](https://github.com/zeit/next-plugins/tree/master/packages/next-preact)
- [@next/mdx](https://github.com/zeit/next.js/tree/canary/packages/next-mdx)

> **Warning:** The `webpack` function is executed twice, once for the server and once for the client. This allows you to distinguish between client and server configuration using the `isServer` property.

Multiple configurations can be combined together with function composition. For example:

```js
const withMDX = require('@next/mdx')
const withSass = require('@zeit/next-sass')

module.exports = withMDX(
  withSass({
    webpack(config, options) {
      // Further custom configuration here
      return config
    },
  })
)
```

In order to extend our usage of `webpack`, you can define a function that extends its config via `next.config.js`.

```js
// next.config.js is not transformed by Babel. So you can only use javascript features supported by your version of Node.js.

module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Note: we provide webpack above so you should not `require` it
    // Perform customizations to webpack config
    // Important: return the modified config

    // Example using webpack option
    config.plugins.push(new webpack.IgnorePlugin(/\/__tests__\//))
    return config
  },
  webpackDevMiddleware: config => {
    // Perform customizations to webpack dev middleware config
    // Important: return the modified config
    return config
  },
}
```

The second argument to `webpack` is an object containing properties useful when customizing its configuration:

- `buildId` - `String` the build id used as a unique identifier between builds
- `dev` - `Boolean` shows if the compilation is done in development mode
- `isServer` - `Boolean` shows if the resulting configuration will be used for server side (`true`), or client side compilation (`false`)
- `defaultLoaders` - `Object` Holds loader objects Next.js uses internally, so that you can use them in custom configuration
  - `babel` - `Object` the `babel-loader` configuration for Next.js

Example usage of `defaultLoaders.babel`:

```js
// Example next.config.js for adding a loader that depends on babel-loader
// This source was taken from the @next/mdx plugin source:
// https://github.com/zeit/next.js/tree/canary/packages/next-mdx
module.exports = {
  webpack: (config, options) => {
    config.module.rules.push({
      test: /\.mdx/,
      use: [
        options.defaultLoaders.babel,
        {
          loader: '@mdx-js/loader',
          options: pluginOptions.options,
        },
      ],
    })

    return config
  },
}
```

### Customizing babel config

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-custom-babel-config">Custom babel configuration</a></li>
  </ul>
</details>

In order to extend our usage of `babel`, you can simply define a `.babelrc` file at the root of your app. This file is optional.

If found, we're going to consider it the _source of truth_, therefore it needs to define what next needs as well, which is the `next/babel` preset.

This is designed so that you are not surprised by modifications we could make to the babel configurations.

Here's an example `.babelrc` file:

```json
{
  "presets": ["next/babel"],
  "plugins": []
}
```

The `next/babel` preset includes everything needed to transpile React applications. This includes:

- preset-env
- preset-react
- preset-typescript
- plugin-proposal-class-properties
- plugin-proposal-object-rest-spread
- plugin-transform-runtime
- styled-jsx

These presets / plugins **should not** be added to your custom `.babelrc`. Instead, you can configure them on the `next/babel` preset:

```json
{
  "presets": [
    [
      "next/babel",
      {
        "preset-env": {},
        "transform-runtime": {},
        "styled-jsx": {},
        "class-properties": {}
      }
    ]
  ],
  "plugins": []
}
```

The `modules` option on `"preset-env"` should be kept to `false` otherwise webpack code splitting is disabled.

### Exposing configuration to the server / client side

There is a common need in applications to provide configuration values.

Next.js supports 2 ways of providing configuration:

- Build-time configuration
- Runtime configuration

#### Build-time configuration

The way build-time configuration works is by inlining the provided values into the Javascript bundle.

You can add the `env` key in `next.config.js`:

```js
// next.config.js
module.exports = {
  env: {
    customKey: 'value',
  },
}
```

This will allow you to use `process.env.customKey` in your code. For example:

```jsx
// pages/index.js
function Index() {
  return <h1>The value of customKey is: {process.env.customKey}</h1>
}

export default Index
```

> **Warning:** Note that it is not possible to destructure process.env variables due to the webpack `DefinePlugin` replacing process.env.XXXX inline at build time.

```js
// Will not work
const { CUSTOM_KEY, CUSTOM_SECRET } = process.env
AuthMethod({ key: CUSTOM_KEY, secret: CUSTOM_SECRET })

// Will work as replaced inline
AuthMethod({ key: process.env.CUSTOM_KEY, secret: process.env.CUSTOM_SECRET })
```

#### Runtime configuration

> **Warning:** Note that this option is not available when using `target: 'serverless'`

> **Warning:** Generally you want to use build-time configuration to provide your configuration.
> The reason for this is that runtime configuration adds rendering / initialization overhead and is **incompatible with [automatic prerendering](#automatic-prerendering)**.

The `next/config` module gives your app access to the `publicRuntimeConfig` and `serverRuntimeConfig` stored in your `next.config.js`.

Place any server-only runtime config under a `serverRuntimeConfig` property.

Anything accessible to both client and server-side code should be under `publicRuntimeConfig`.

> **Note**: A page that relies on `publicRuntimeConfig` **must** use `getInitialProps` to opt-out of [automatic prerendering](#automatic-prerendering).
> You can also de-optimize your entire application by creating a [Custom `<App>`](#custom-app) with `getInitialProps`.

```js
// next.config.js
module.exports = {
  serverRuntimeConfig: {
    // Will only be available on the server side
    mySecret: 'secret',
    secondSecret: process.env.SECOND_SECRET, // Pass through env variables
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    staticFolder: '/static',
  },
}
```

```js
// pages/index.js
import getConfig from 'next/config'
// Only holds serverRuntimeConfig and publicRuntimeConfig from next.config.js nothing else.
const { serverRuntimeConfig, publicRuntimeConfig } = getConfig()

console.log(serverRuntimeConfig.mySecret) // Will only be available on the server side
console.log(publicRuntimeConfig.staticFolder) // Will be available on both server and client

function MyImage() {
  return (
    <div>
      <img src={`${publicRuntimeConfig.staticFolder}/logo.png`} alt="logo" />
    </div>
  )
}

export default MyImage
```

### Starting the server on alternative hostname

To start the development server using a different default hostname you can use `--hostname hostname_here` or `-H hostname_here` option with next dev. This will start a TCP server listening for connections on the provided host.

### CDN support with Asset Prefix

To set up a CDN, you can set up the `assetPrefix` setting and configure your CDN's origin to resolve to the domain that Next.js is hosted on.

```js
const isProd = process.env.NODE_ENV === 'production'
module.exports = {
  // You may only need to add assetPrefix in the production.
  assetPrefix: isProd ? 'https://cdn.mydomain.com' : '',
}
```

Note: Next.js will automatically use that prefix in the scripts it loads, but this has no effect whatsoever on `/static`. If you want to serve those assets over the CDN, you'll have to introduce the prefix yourself. One way of introducing a prefix that works inside your components and varies by environment is documented [in this example](https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration-build-time).

If your CDN is on a separate domain and you would like assets to be requested using a [CORS aware request](https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_settings_attributes) you can set a config option for that.

```js
// next.config.js
module.exports = {
  crossOrigin: 'anonymous',
}
```

## Automatic Prerendering

Next.js automatically determines that a page is static (can be prerendered) if it has no has blocking data requirements.
This determination is made by the absence of `getInitialProps` in the page.

If `getInitialProps` is present, Next.js will not prerender the page.
Instead, Next.js will use its default behavior and render the page on-demand, per-request (meaning Server-Side Rendering).

If `getInitialProps` is absent, Next.js will **statically optimize** your page automatically by prerendering it to static HTML.

This feature allows Next.js to emit hybrid applications that contain **both server-rendered and statically generated pages**.
This ensures Next.js always emits applications that are **fast by default**.

> **Note**: Statically generated pages are still reactive: Next.js will hydrate your application client-side to give it full interactivity.

This feature provides many benefits.
For example, optimized pages require no server-side computation and can be instantly streamed to the end-user from CDN locations.

The result is an _ultra fast_ loading experience for your users.

`next build` will emit `.html` files for statically optimized pages.
The result will be a file named `.next/server/static/${BUILD_ID}/about.html` instead of `.next/server/static/${BUILD_ID}/about.js`.
This behavior is similar for `target: 'serverless'`.

The built-in Next.js server (`next start`) and programmatic API (`app.getRequestHandler()`) both support this build output transparently.
There is no configuration or special handling required.

> **Note**: If you have a [custom `<App>`](#custom-app) with `getInitialProps` then this optimization will be disabled.

> **Note**: If you have a [custom `<Document>`](#custom-document) with `getInitialProps` be sure you check if `ctx.req` is defined before assuming the page is server-side rendered.
> `ctx.req` will be `undefined` for pages that are prerendered.

## Production deployment

To deploy, instead of running `next`, you want to build for production usage ahead of time. Therefore, building and starting are separate commands:

```bash
next build
next start
```

To deploy Next.js with [ZEIT Now](https://zeit.co/now) see the [ZEIT Guide for Deploying Next.js with Now](https://zeit.co/guides/deploying-nextjs-with-now/).

Next.js can be deployed to other hosting solutions too. Please have a look at the ['Deployment'](https://github.com/zeit/next.js/wiki/Deployment) section of the wiki.

Note: `NODE_ENV` is properly configured by the `next` subcommands, if absent, to maximize performance. if you’re using Next.js [programmatically](#custom-server-and-routing), it’s your responsibility to set `NODE_ENV=production` manually!

Note: we recommend putting `.next`, or your [custom dist folder](https://github.com/zeit/next.js#custom-configuration), in `.gitignore` or `.npmignore`. Otherwise, use `files` or `now.files` to opt-into a whitelist of files you want to deploy, excluding `.next` or your custom dist folder.

### Serverless deployment

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/now-examples/tree/master/nextjs">now.sh</a></li>
    <li><a href="https://github.com/TejasQ/anna-artemov.now.sh">anna-artemov.now.sh</a></li>
    <li>We encourage contributing more examples to this section</li>
  </ul>
</details>

Serverless deployment dramatically improves reliability and scalability by splitting your application into smaller parts (also called [**lambdas**](https://zeit.co/docs/v2/deployments/concepts/lambdas/)).
In the case of Next.js, each page in the `pages` directory becomes a serverless lambda.

There are [a number of benefits](https://zeit.co/blog/serverless-express-js-lambdas-with-now-2#benefits-of-serverless-express) to serverless.
The referenced link talks about some of them in the context of Express, but the principles apply universally:
serverless allows for distributed points of failure, infinite scalability, and is incredibly affordable with a "pay for what you use" model.

To enable **serverless mode** in Next.js, add the `serverless` build `target` in `next.config.js`:

```js
// next.config.js
module.exports = {
  target: 'serverless',
}
```

The `serverless` target will output a single lambda or [HTML file](#automatic-prerendering) per page.
This file is completely standalone and doesn't require any dependencies to run:

- `pages/index.js` => `.next/serverless/pages/index.js`
- `pages/about.js` => `.next/serverless/pages/about.js`
- `pages/blog.js` => `.next/serverless/pages/blog.html`

The signature of the Next.js Serverless function is similar to the Node.js HTTP server callback:

```ts
export function render(req: http.IncomingMessage, res: http.ServerResponse) => void
```

- [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage)
- [http.ServerResponse](https://nodejs.org/api/http.html#http_class_http_serverresponse)
- `void` refers to the function not having a return value and is equivalent to JavaScript's `undefined`. Calling the function will finish the request.

The static HTML files are ready to be served as-is.
You can read more about this feature, including how to opt-out, in the [Automatic Prerendering section](#automatic-prerendering).

Using the serverless target, you can deploy Next.js to [ZEIT Now](https://zeit.co/now) with all of the benefits and added ease of control like for example; [custom routes](https://zeit.co/guides/custom-next-js-server-to-routes/) and caching headers. See the [ZEIT Guide for Deploying Next.js with Now](https://zeit.co/guides/deploying-nextjs-with-now/) for more information.

#### One Level Lower

Next.js provides low-level APIs for serverless deployments as hosting platforms have different function signatures. In general you will want to wrap the output of a Next.js serverless build with a compatibility layer.

For example if the platform supports the Node.js [`http.Server`](https://nodejs.org/api/http.html#http_class_http_server) class:

```js
const http = require('http')
const page = require('./.next/serverless/pages/about.js')
const server = new http.Server((req, res) => page.render(req, res))
server.listen(3000, () => console.log('Listening on http://localhost:3000'))
```

For specific platform examples see [the examples section above](#serverless-deployment).

#### Summary

- Low-level API for implementing serverless deployment
- Every page in the `pages` directory becomes a serverless function (lambda)
- Creates the smallest possible serverless function (50Kb base zip size)
- Optimized for fast [cold start](https://zeit.co/blog/serverless-ssr#cold-start) of the function
- The serverless function has 0 dependencies (they are included in the function bundle)
- Uses the [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) and [http.ServerResponse](https://nodejs.org/api/http.html#http_class_http_serverresponse) from Node.js
- opt-in using `target: 'serverless'` in `next.config.js`
- Does not load `next.config.js` when executing the function, note that this means `publicRuntimeConfig` / `serverRuntimeConfig` are not supported

## Browser support

Next.js supports IE11 and all modern browsers out of the box using [`@babel/preset-env`](https://new.babeljs.io/docs/en/next/babel-preset-env.html). In order to support IE11 Next.js adds a global `Promise` polyfill. In cases where your own code or any external NPM dependencies you are using requires features not supported by your target browsers you will need to implement polyfills.

The [polyfills](https://github.com/zeit/next.js/tree/canary/examples/with-polyfills) example demonstrates the recommended approach to implement polyfills.

## TypeScript

TypeScript is supported out of the box in Next.js. To get started using it create a `tsconfig.json` in your project:

```js
{
  "compilerOptions": {
    "allowJs": true, /* Allow JavaScript files to be type checked. */
    "alwaysStrict": true, /* Parse in strict mode. */
    "esModuleInterop": true, /* matches compilation setting */
    "isolatedModules": true, /* to match webpack loader */
    "jsx": "preserve", /* Preserves jsx outside of Next.js. */
    "lib": ["dom", "es2017"], /* List of library files to be included in the type checking. */
    "module": "esnext", /* Specifies the type of module to type check. */
    "moduleResolution": "node", /* Determine how modules get resolved. */
    "noEmit": true, /* Do not emit outputs. Makes sure tsc only does type checking. */

    /* Strict Type-Checking Options, optional, but recommended. */
    "noFallthroughCasesInSwitch": true, /* Report errors for fallthrough cases in switch statement. */
    "noUnusedLocals": true, /* Report errors on unused locals. */
    "noUnusedParameters": true, /* Report errors on unused parameters. */
    "strict": true /* Enable all strict type-checking options. */,
    "target": "esnext" /* The type checking input. */
  }
}
```

After adding the `tsconfig.json` you need to install `@types` to get proper TypeScript typing.

```bash
npm install --save-dev @types/react @types/react-dom @types/node
```

Now can change any file from `.js` to `.ts` / `.tsx` (tsx is for files using JSX). To learn more about TypeScript checkout its [documentation](https://www.typescriptlang.org/).

### Exported types

Next.js provides `NextPage` type that can be used for pages in the `pages` directory. `NextPage` adds definitions for [`getInitialProps`](#fetching-data-and-component-lifecycle) so that it can be used without any extra typing needed.

```tsx
import { NextPage } from 'next'

interface Props {
  userAgent: string
}

const Page: NextPage<Props> = ({ userAgent }) => (
  <main>Your user agent: {userAgent}</main>
)

Page.getInitialProps = async ({ req }) => {
  const userAgent = req ? req.headers['user-agent'] : navigator.userAgent
  return { userAgent }
}

export default Page
```

For [API routes](#api-routes) types, we provide `NextApiRequest` and `NextApiResponse`, which extend the `Node.js` request and response objects.

```ts
import { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ title: 'Next.js' })
```

For `React.Component` you can use `NextPageContext`:

```tsx
import React from 'react'
import { NextPageContext } from 'next'

interface Props {
  userAgent: string
}

export default class Page extends React.Component<Props> {
  static async getInitialProps({ req }: NextPageContext) {
    const userAgent = req ? req.headers['user-agent'] : navigator.userAgent
    return { userAgent }
  }

  render() {
    const { userAgent } = this.props
    return <main>Your user agent: {userAgent}</main>
  }
}
```

## AMP Support

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/amp">amp</a></li>
  </ul>
</details>

### Enabling AMP Support

To enable AMP support for a page, add `export const config = { amp: true }` to your page.

### AMP First Page

```js
// pages/about.js
export const config = { amp: true }

export default function AboutPage(props) {
  return <h3>My AMP About Page!</h3>
}
```

### Hybrid AMP Page

```js
// pages/hybrid-about.js
import { useAmp } from 'next/amp'

export const config = { amp: 'hybrid' }

export default function AboutPage(props) {
  return (
    <div>
      <h3>My AMP Page</h3>
      {useAmp() ? (
        <amp-img
          width="300"
          height="300"
          src="/my-img.jpg"
          alt="a cool image"
          layout="responsive"
        />
      ) : (
        <img width="300" height="300" src="/my-img.jpg" alt="a cool image" />
      )}
    </div>
  )
}
```

### AMP Page Modes

AMP pages can specify two modes:

- AMP-only (default)
  - Pages have no Next.js or React client-side runtime
  - Pages are automatically optimized with [AMP Optimizer](https://github.com/ampproject/amp-toolbox/tree/master/packages/optimizer), an optimizer that applies the same transformations as AMP caches (improves performance by up to 42%)
  - Pages have a user-accessible (optimized) version of the page and a search-engine indexable (unoptimized) version of the page
  - Opt-in via `export const config = { amp: true }`
- Hybrid
  - Pages are able to be rendered as traditional HTML (default) and AMP HTML (by adding `?amp=1` to the URL)
  - The AMP version of the page only has valid optimizations applied with AMP Optimizer so that it is indexable by search-engines
  - Opt-in via `export const config = { amp: 'hybrid' }`
  - Able to differentiate between modes using `useAmp` from `next/amp`

Both of these page modes provide a consistently fast experience for users accessing pages through search engines.

### AMP Behavior with `next export`

When using `next export` to statically prerender pages Next.js will detect if the page supports AMP and change the exporting behavior based on that.

Hybrid AMP (`pages/about.js`) would output:

- `out/about.html` - with client-side React runtime
- `out/about.amp.html` - AMP page

AMP-only (`pages/about.js`) would output:

- `out/about.html` - Optimized AMP page

During export Next.js automatically detects if a page is hybrid AMP and outputs the AMP version to `page.amp.html`. We also automatically insert the `<link rel="amphtml" href="/page.amp" />` and `<link rel="canonical" href="/" />` tags for you.

> **Note**: When using `exportTrailingSlash: true` in `next.config.js`, output will be different. For Hybrid AMP pages, output will be `out/page/index.html` and `out/page.amp/index.html`, and for AMP-only pages, output will be `out/page/index.html`

### Adding AMP Components

The AMP community provides [many components](https://amp.dev/documentation/components/) to make AMP pages more interactive. You can add these components to your page by using `next/head`:

```js
// pages/hello.js
import Head from 'next/head'

export const config = { amp: true }

export default function MyAmpPage() {
  return (
    <div>
      <Head>
        <script
          async
          key="amp-timeago"
          custom-element="amp-timeago"
          src="https://cdn.ampproject.org/v0/amp-timeago-0.1.js"
        />
      </Head>

      <p>Some time: {date.toJSON()}</p>
      <amp-timeago
        width="0"
        height="15"
        datetime={date.toJSON()}
        layout="responsive"
      >
        .
      </amp-timeago>
    </div>
  )
}
```

### AMP Validation

AMP pages are automatically validated with [amphtml-validator](https://www.npmjs.com/package/amphtml-validator) during development. Errors and warnings will appear in the terminal where you started Next.js.

Pages are also validated during `next export` and any warnings / errors will be printed to the terminal.
Any AMP errors will cause `next export` to exit with status code `1` because the export is not valid AMP.

### TypeScript Support

AMP currently doesn't have built-in types for TypeScript, but it's in their roadmap ([#13791](https://github.com/ampproject/amphtml/issues/13791)). As a workaround you can manually add the types to `amp.d.ts` like [here](https://stackoverflow.com/a/50601125).

## Static HTML export

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-static-export">Static export</a></li>
  </ul>
</details>

`next export` is a way to run your Next.js app as a standalone static app without the need for a Node.js server.
The exported app supports almost every feature of Next.js, including dynamic urls, prefetching, preloading and dynamic imports.

The way `next export` works is by prerendering all pages possible to HTML. It does so based on a mapping of `pathname` key to page object. This mapping is called the `exportPathMap`.

The page object has 2 values:

- `page` - `String` the page inside the `pages` directory to render
- `query` - `Object` the `query` object passed to `getInitialProps` when prerendering. Defaults to `{}`

### Usage

Simply develop your app as you normally do with Next.js. Then run:

```
next build
next export
```

By default `next export` doesn't require any configuration. It will generate a default `exportPathMap` containing the routes to pages inside the `pages` directory. This default mapping is available as `defaultPathMap` in the example below.

If your application has dynamic routes you can add a dynamic `exportPathMap` in `next.config.js`.
This function is asynchronous and gets the default `exportPathMap` as a parameter.

```js
// next.config.js
module.exports = {
  exportPathMap: async function(
    defaultPathMap,
    { dev, dir, outDir, distDir, buildId }
  ) {
    return {
      '/': { page: '/' },
      '/about': { page: '/about' },
      '/readme.md': { page: '/readme' },
      '/p/hello-nextjs': { page: '/post', query: { title: 'hello-nextjs' } },
      '/p/learn-nextjs': { page: '/post', query: { title: 'learn-nextjs' } },
      '/p/deploy-nextjs': { page: '/post', query: { title: 'deploy-nextjs' } },
    }
  },
}
```

The pages will be exported as html files, i.e. `/about` will become `/about.html`.

It is possible to configure Next.js to export pages as `index.html` files and require trailing slashes, i.e. `/about` becomes `/about/index.html` and is routable via `/about/`.
This was the default behavior prior to Next.js 9.
You can use the following `next.config.js` to switch back to this behavior:

```js
// next.config.js
module.exports = {
  exportTrailingSlash: true,
}
```

> **Note**: If the export path is a filename (e.g. `/readme.md`) and is different than `.html`, you may need to set the `Content-Type` header to `text/html` when serving this content.

The second argument is an `object` with:

- `dev` - `true` when `exportPathMap` is being called in development. `false` when running `next export`. In development `exportPathMap` is used to define routes.
- `dir` - Absolute path to the project directory
- `outDir` - Absolute path to the `out/` directory (configurable with `-o` or `--outdir`). When `dev` is `true` the value of `outDir` will be `null`.
- `distDir` - Absolute path to the `.next/` directory (configurable using the `distDir` config key)
- `buildId` - The `buildId` the export is running for

Then simply run these commands:

```bash
next build
next export
```

For that you may need to add a NPM script to `package.json` like this:

```json
{
  "scripts": {
    "build": "next build",
    "export": "npm run build && next export"
  }
}
```

And run it at once with:

```bash
npm run export
```

Then you have a static version of your app in the `out` directory.

> You can also customize the output directory. For that run `next export -h` for the help.

Now you can deploy the `out` directory to any static hosting service. Note that there is an additional step for deploying to GitHub Pages, [documented here](https://github.com/zeit/next.js/wiki/Deploying-a-Next.js-app-into-GitHub-Pages).

For an example, simply visit the `out` directory and run following command to deploy your app to [ZEIT Now](https://zeit.co/now).

```bash
now
```

### Limitation

With `next export`, we build a HTML version of your app. At export time we will run `getInitialProps` of your pages.

The `req` and `res` fields of the `context` object passed to `getInitialProps` are empty objects during export as there is no server running.

> **Note**: If your pages don't have `getInitialProps` you may not need `next export` at all, `next build` is already enough thanks to [automatic prerendering](#automatic-prerendering).

> You won't be able to render HTML dynamically when static exporting, as we pre-build the HTML files. If you want to do dynamic rendering use `next start` or the custom server API

## Multi Zones

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="/examples/with-zones">With Zones</a></li>
  </ul>
</details>

A zone is a single deployment of a Next.js app. Just like that, you can have multiple zones and then you can merge them as a single app.

For an example, you can have two zones like this:

- An app for serving `/blog/**`
- Another app for serving all other pages

With multi zones support, you can merge both these apps into a single one allowing your customers to browse it using a single URL, but you can develop and deploy both apps independently.

> This is exactly the same concept of microservices, but for frontend apps.

### How to define a zone

There are no special zones related APIs. You only need to do following:

- Make sure to keep only the pages you need in your app, meaning that an app can't have pages from another app, if app `A` has `/blog` then app `B` shouldn't have it too.
- Make sure to add an [assetPrefix](https://github.com/zeit/next.js#cdn-support-with-asset-prefix) to avoid conflicts with static files.

### How to merge them

You can merge zones using any HTTP proxy.

You can use [now dev](https://zeit.co/docs/v2/development/basics) as your local development server. It allows you to easily define routing routes for multiple apps like below:

```json
{
  "version": 2,
  "builds": [
    { "src": "docs/next.config.js", "use": "@now/next" },
    { "src": "home/next.config.js", "use": "@now/next" }
  ],
  "routes": [
    { "src": "/docs/_next(.*)", "dest": "docs/_next$1" },
    { "src": "/docs(.*)", "dest": "docs/docs$1" },
    { "src": "(.*)", "dest": "home$1" }
  ]
}
```

For the production deployment, you can use the same configuration and run `now` to do the deployment with [ZEIT Now](https://zeit.co/now). Otherwise you can also configure a proxy server to route using a set of routes like the ones above, e.g deploy the docs app to `https://docs.example.com` and the home app to `https://home.example.com` and then add a proxy server for both apps in `https://example.com`.

## Recipes

- [Setting up 301 redirects](https://www.raygesualdo.com/posts/301-redirects-with-nextjs/)
- [Dealing with SSR and server only modules](https://arunoda.me/blog/ssr-and-server-only-modules)
- [Building with React-Material-UI-Next-Express-Mongoose-Mongodb](https://github.com/builderbook/builderbook)
- [Build a SaaS Product with React-Material-UI-Next-MobX-Express-Mongoose-MongoDB-TypeScript](https://github.com/async-labs/saas)

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

Next.js bundles [styled-jsx](https://github.com/zeit/styled-jsx) supporting scoped css. However you can use any CSS-in-JS solution in your Next app by just including your favorite library [as mentioned before](#css-in-js) in the document.

</details>

<details>
  <summary>What syntactic features are transpiled? How do I change them?</summary>

We track V8. Since V8 has wide support for ES6 and `async` and `await`, we transpile those. Since V8 doesn’t support class decorators, we don’t transpile those.

See the documentation about [customizing the babel config](#customizing-babel-config) and [next/preset](/packages/next/build/babel/preset.js) for more information.

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

Yes! Here's an example with [Apollo](/examples/with-apollo).

</details>

<details>
<summary>Can I use it with Redux and thunk?</summary>

Yes! Here's an [example](/examples/with-redux-thunk).

</details>

<details>
<summary>Can I use it with Redux?</summary>

Yes! Here's an [example](/examples/with-redux).

</details>

<details>
<summary>Can I use Next with my favorite Javascript library or toolkit?</summary>

Since our first release we've had **many** example contributions, you can check them out in the [examples](/examples) directory.

</details>

<details>
<summary>What is this inspired by?</summary>

Many of the goals we set out to accomplish were the ones listed in [The 7 principles of Rich Web Applications](http://rauchg.com/2014/7-principles-of-rich-web-applications/) by Guillermo Rauch.

The ease-of-use of PHP is a great inspiration. We feel Next.js is a suitable replacement for many scenarios where you otherwise would use PHP to output HTML.

Unlike PHP, we benefit from the ES6 module system and every file exports a **component or function** that can be easily imported for lazy evaluation or testing.

As we were researching options for server-rendering React that didn’t involve a large number of steps, we came across [react-page](https://github.com/facebookarchive/react-page) (now deprecated), a similar approach to Next.js by the creator of React Jordan Walke.

</details>

## Contributing

Please see our [contributing.md](/contributing.md).

## Authors

- Arunoda Susiripala ([@arunoda](https://twitter.com/arunoda)) – [ZEIT](https://zeit.co)
- Tim Neutkens ([@timneutkens](https://twitter.com/timneutkens)) – [ZEIT](https://zeit.co)
- Naoyuki Kanezawa ([@nkzawa](https://twitter.com/nkzawa)) – [ZEIT](https://zeit.co)
- Tony Kovanen ([@tonykovanen](https://twitter.com/tonykovanen)) – [ZEIT](https://zeit.co)
- Guillermo Rauch ([@rauchg](https://twitter.com/rauchg)) – [ZEIT](https://zeit.co)
- Dan Zajdband ([@impronunciable](https://twitter.com/impronunciable)) – Knight-Mozilla / Coral Project

```

```
