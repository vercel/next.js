# Invalid unstable_getStaticPaths Return Value

#### Why This Error Occurred

In one of the page's `unstable_getStaticPaths` the return value had the incorrect shape.

#### Possible Ways to Fix It

Make sure to return the following shape from `unstable_getStaticPaths`:

```js
export async function unstable_getStaticProps() {
  return {
    paths: Array<string | { params: { [key: string]: string } }>
  }
}
```
