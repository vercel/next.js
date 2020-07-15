# Re-exporting all exports from a page is disallowed

#### Why This Error Occurred

The following export breaks Next.js compilation of pages:

```js
export * from '...'
```

Node.js code may be leaked to the browser build causing an error. For example, the next two pages:

```js
// pages/one.js
import fs from 'fs'

export default function A() {
  return <main />
}

export function getStaticProps() {
  fs
  return { props: {} }
}
```

```js
// pages/two.js
export * from './one'
```

Will cause the following error:

```
Module not found: Can't resolve 'fs' in './pages/two.js'
```

#### Possible Ways to Fix It

Remove `export * from '...'` from Next.js pages.
