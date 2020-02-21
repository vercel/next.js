# Invalid unstable_getStaticProps Return Value

#### Why This Error Occurred

In one of the page's `unstable_getStaticProps` the return value had the incorrect shape.

#### Possible Ways to Fix It

Make sure to return the following shape from `unstable_getStaticProps`:

```js
export async function unstable_getStaticProps() {
  return {
    props: { [key: string]: any }
  }
}
```
