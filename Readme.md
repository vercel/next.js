# next.js

`Next.js` is a minimalistic framework for server-rendered React applications.

## How to use

The file-system is the main API. Every `.js` file becomes a route that gets automatically processed and rendered.

Populate `./pages/index.js` inside your project:

```jsx
import React from 'react'
export default () => (
  <div>Welcome to next.js!</div>
)
```

and then just run `next` and go to `http://localhost:3000`

So far, we get:

- Automatic transpilation and bundling (with webpack and babel)
- Hot code reloading
- Server rendering and indexing of `./pages`
- Static file serving. `./static/` is mapped to `/static/`

### Bundling (code splitting)

Every `import` you declare gets bundled and served with each page

```jsx
import React from 'react'
import cowsay from 'cowsay-browser'
export default () => (
  <pre>{ cowsay({ text: 'hi there!' }) }</pre>
)
```

That means pages never load unneccessary code!

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
  main: {
    background: 'red',
    ':hover': {
      background: 'gray'
    }
    '@media (max-width: 600px)': {
      background: 'blue'
    }
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

### Lifecycle components

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

- `path` - `String` of the current path excluding the query string
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

Note: we recommend putting `.next` in `.npmignore` or `.gitigore`. Otherwise, use `files` or `now.files` to opt-into a whitelist of files you want to deploy (and obviously exclude `.next`)

## FAQ

The following tasks are planned and part of our roadmap

- [ ] Add option to supply a `req`, `res` handling function for custom routing
- [ ] Add option to extend or replace custom babel configuration
- [ ] Add option to extend or replace custom webpack configuration
- [ ] Investigate pluggable component-oriented rendering backends (Inferno, Preact, etc)
