# Conflicting SSG Paths

#### Why This Error Occurred

In your `getStaticPaths` function for one of your pages you returned conflicting paths. All page paths must be unique and duplicates are not allowed.

#### Possible Ways to Fix It

Remove any conflicting paths shown in the error message and only return them from one `getStaticPaths`.

Example conflicting paths:

```jsx
// pages/hello/world.js
export default function Hello() {
  return 'hello world!'
}

// pages/[...catchAll].js
export const getStaticProps = () => ({ props: {} })

export const getStaticPaths = () => ({
  paths: [
    // this conflicts with the /hello/world.js page, remove to resolve error
    '/hello/world',
    '/another',
  ],
  fallback: false,
})

export default function CatchAll() {
  return 'Catch-all page'
}
```

Example conflicting paths:

```jsx
// pages/blog/[slug].js
export const getStaticPaths = () => ({
  paths: ['/blog/conflicting', '/blog/another'],
  fallback: false,
})

export default function Blog() {
  return 'Blog!'
}

// pages/[...catchAll].js
export const getStaticProps = () => ({ props: {} })

export const getStaticPaths = () => ({
  paths: [
    // this conflicts with the /blog/conflicting path above, remove to resolve error
    '/blog/conflicting',
    '/another',
  ],
  fallback: false,
})

export default function CatchAll() {
  return 'Catch-all page'
}
```

### Useful Links

- [`getStaticPaths` Documentation](https://nextjs.org/docs/basic-features/data-fetching#getstaticpaths-static-generation)
