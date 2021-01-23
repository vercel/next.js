# Re-exporting all exports from a page is disallowed

#### Why This Error Occurred

The following export can potentially break Next.js' compilation of pages:

```ts
export * from '...'
```

This is because Node.js code may be leaked to the browser build, causing an error. For example, the following two pages:

```ts
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

```ts
// pages/two.js
export * from './one'
```

Would cause the following error:

```
Module not found: Can't resolve 'fs' in './pages/two.js'
```

#### Possible Ways to Fix It

Update your page to re-export the default component only:

```ts
export { default } from './other-page'
```

If the other page uses `getServerSideProps` or `getStaticProps`, you can re-export those individually too:

```ts
export { default, getServerSideProps } from './other-page'
// or
export { default, getStaticProps } from './other-page'
// or
export { default, getStaticProps, getStaticPaths } from './other-page/[dynamic]'
```
