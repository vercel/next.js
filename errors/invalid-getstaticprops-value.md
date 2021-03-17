# Invalid getStaticProps Return Value

#### Why This Error Occurred

In one of the page's `getStaticProps` the return value had the incorrect shape.

#### Possible Ways to Fix It

Make sure to return the following shape from `getStaticProps`:

```js
export async function getStaticProps(ctx: {
  params?: ParsedUrlQuery
  preview?: boolean
  previewData?: any
}) {
  return {
    props: { [key: string]: any }
  }
}
```
