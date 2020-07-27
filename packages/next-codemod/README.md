# Next.js Codemod

This repository contains Codemod transformations to help upgrade Next.js codebases.

## v9

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

Download the codemod:

```
curl -L https://github.com/zeit/next-codemod/archive/master.tar.gz | tar -xz --strip=2 next-codemod-master/transforms/name-default-component.js
```

Run the transformation:

```
npx jscodeshift -t ./name-default-component.js components/**/*.js
```

TypeScript files can use this codemod too:

```
npx jscodeshift -t ./name-default-component.js --parser=tsx components/**/*.tsx
```

If you have components in multiple folders, change the path to `**/*.js` and add `--ignore-pattern="**/node_modules/**"`.

After the transformation is done the `name-default-component.js` file in the root of your project can be removed.

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

Download the codemod:

```
curl -L https://github.com/zeit/next-codemod/archive/master.tar.gz | tar -xz --strip=2 next-codemod-master/transforms/withamp-to-config.js
```

Run the transformation:

```
npx jscodeshift -t ./withamp-to-config.js pages/**/*.js
```

After the transformation is done the `withamp-to-config.js` file in the root of your project can be removed.

## v6

### `url-to-withrouter`

Tranforms the deprecated automatically injected `url` property on top level pages to using `withRouter` and the `router` property it injects. Read more here: [err.sh/next.js/url-deprecated](https://err.sh/next.js/url-deprecated)

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

This is just one case. All the cases that are transformed (and tested) can be found in the [`__testfixtures__` directory](./transforms/__testfixtures__/url-to-withrouter).

#### Usage

Go to your project

```
cd path-to-your-project/
```

Download the codemod:

```
curl -L https://github.com/zeit/next-codemod/archive/master.tar.gz | tar -xz --strip=2 next-codemod-master/transforms/url-to-withrouter.js
```

Run the transformation:

```
npx jscodeshift -t ./url-to-withrouter.js pages/**/*.js
```

After the transformation is done the `url-to-withrouter.js` file in the root of your project can be removed.

## Authors

- Tim Neutkens ([@timneutkens](https://twitter.com/timneutkens)) – [ZEIT](https://zeit.co)
- Joe Haddad ([@timer150](https://twitter.com/timer150)) - [ZEIT](https://zeit.co)
