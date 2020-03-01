# Invalid getStaticPaths Return Value

#### Why This Error Occurred

In one of the page's `getStaticPaths` the return value had the incorrect shape.

#### Possible Ways to Fix It

Make sure to return the following shape from `getStaticPaths`:

```js
export async function getStaticPaths() {
  return {
    paths: Array<string | { params: { [key: string]: string } }>,
    fallback: boolean
  }
}
```

There are two required properties:

1. `paths`: this property is an [Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array) of URLs ("paths") that should be statically generated at build-time. The returned paths must match the dynamic route shape.
   - You may return a [String](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) or an [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) that explicitly defines all URL `params`.
     ```js
     // pages/blog/[slug].js
     export async function getStaticPaths() {
       return {
         paths: [
           // String variant:
           '/blog/first-post',
           // Object variant:
           { params: { slug: 'second-post' } },
         ],
         fallback: true,
       }
     }
     ```
1. `fallback`: this property is a [Boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), specifying whether or not a fallback version of this page should be generated.
   - Enabling `fallback` (via `true`) allows you to return a subset of all the possible paths that should be statically generated. At runtime, Next.js will statically generate the remaining paths the **first time they are requested**. Consecutive calls to the path will be served as-if it was statically generated at build-time. This reduces build times when dealing with thousands or millions of pages.
   - Disabling `fallback` (via `false`) requires you return the full collection of paths you would like to statically generate at build-time. At runtime, any path that was not generated at build-time **will 404**.
