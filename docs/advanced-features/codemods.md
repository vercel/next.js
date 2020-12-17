---
description: Use codemods to update your codebase when upgrading Next.js to the latest version
---

# Next.js Codemods

Next.js provides Codemod transformations to help upgrade your Next.js codebase when a feature is deprecated.

Codemods are transformations that run on your codebase programmatically. This allows for a large amount of changes to be applied without having to manually go through every file.

## Usage

`npx @next/codemod <transform> <path>`

- `transform` - name of transform, see available transforms below.
- `path` - files or directory to transform
- `--dry` Do a dry-run, no code will be edited
- `--print` Prints the changed output for comparison

## Next.js 10

### `update-router-api`

Transforms the deprecated as JSX Attribute in Link JSX Element and the Router API.

For example

```jsx
// my-component.js
import Router from 'next/router'

export default class extends React.Component {
  onClick = (id) => {
    Router.push('/url/[id]', `/url/${id}`)
  }
  render() {
    return <button onClick={() => this.onClick('123')}>Test</button>
  }
}
```

Transforms into:

```jsx
// my-component.js
export default class extends React.Component {
  onClick = (id) => {
    Router.push(`/url/${id}`)
  }
  render() {
    return <button onClick={() => this.onClick('123')}>Test</button>
  }
}
```

Rename as JSX attr of Link JSX Element to href
Remove the as argument in router.push, Router.push
Remove the as argument in router.replace, Router.replace

#### Usage

Go to your project

```
cd path-to-your-project/
```

Run the codemod:

```
npx @next/codemod update-router-api
```

## Next.js 9

### `name-default-component`

Transforms anonymous components into named components to make sure they work with [Fast Refresh](https://nextjs.org/blog/next-9-4#fast-refresh).

For example

```jsx
// my-component.js
export default function () {
  return <div>Hello World</div>
}
```

Transforms into:

```jsx
// my-component.js
export default function MyComponent() {
  return <div>Hello World</div>
}
```

The component will have a camel cased name based on the name of the file, and it also works with arrow functions.

#### Usage

Go to your project

```
cd path-to-your-project/
```

Run the codemod:

```
npx @next/codemod name-default-component
```

### `withamp-to-config`

Transforms the `withAmp` HOC into Next.js 9 page configuration.

For example:

```js
// Before
import { withAmp } from 'next/amp'

function Home() {
  return <h1>My AMP Page</h1>
}

export default withAmp(Home)
```

```js
// After
export default function Home() {
  return <h1>My AMP Page</h1>
}

export const config = {
  amp: true,
}
```

#### Usage

Go to your project

```
cd path-to-your-project/
```

Run the codemod:

```
npx @next/codemod withamp-to-config
```

## Next.js 6

### `url-to-withrouter`

Transforms the deprecated automatically injected `url` property on top level pages to using `withRouter` and the `router` property it injects. Read more here: [err.sh/next.js/url-deprecated](https://err.sh/next.js/url-deprecated)

For example:

```js
// From
import React from 'react'
export default class extends React.Component {
  render() {
    const { pathname } = this.props.url
    return <div>Current pathname: {pathname}</div>
  }
}
```

```js
// To
import React from 'react'
import { withRouter } from 'next/router'
export default withRouter(
  class extends React.Component {
    render() {
      const { pathname } = this.props.router
      return <div>Current pathname: {pathname}</div>
    }
  }
)
```

This is just one case. All the cases that are transformed (and tested) can be found in the [`__testfixtures__` directory](https://github.com/vercel/next.js/tree/canary/packages/next-codemod/transforms/__testfixtures__/url-to-withrouter).

#### Usage

Go to your project

```
cd path-to-your-project/
```

Run the codemod:

```
npx @next/codemod url-to-withrouter
```
