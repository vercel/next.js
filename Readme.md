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

We use [Aphrodite](https://github.com/Khan/aphrodite) to provide a great built-in solution for CSS modularization

```jsx
import React from 'react'
import { css, StyleSheet } from 'next/css'

export default () => (
  <div className={ css(styles.main) }>
    Hello world
  </div>
)

const styles = StyleSheet.create({
  main: {
    background: 'red',
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

### Stateful components

When state, lifecycle hooks or initial data population you can export a `React.Component`:

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

### Production deployment

To deploy, run:

```bash
next build
next start
```

For example, to deploy with `now` a `package.json` like follows is recommended:

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

### In progress

The following tasks are planned and part of our roadmap

- [ ] Add option to supply a `req`, `res` handling function for custom routing
- [ ] Add option to supply a custom error component to render 404, 500 pages
- [ ] Add option to extend or replace custom babel configuration
- [ ] Add option to extend or replace custom webpack configuration
