# API Routes Response Size Limited to 4MB

#### Why This Error Occurred

API Routes are meant to respond quickly and are not intended to support responding with large amounts of data. The maximum size of responses is 4MB.

#### Possible Ways to Fix It

If you are not using Next.js in a serverless environment, and understand the performance implications of not using a CDN or dedicated media host, you can set this limit to `false` inside your API Route.

```js
export const config = {
  api: {
    responseLimit: false,
  },
}
```

`responseLimit` can also take the number of bytes or any string format supported by `bytes`, for example `1000`, `'500kb'` or `'3mb'`.
This value will be the maximum response size before a warning is displayed. The default value is 4MB.

```js
export const config = {
  api: {
    responseLimit: '8mb',
  },
}
```
