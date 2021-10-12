---
description: Fetch data on each request with `getServerSideProps`. Learn more about this API for data fetching in Next.js.
---

# `getServerSideProps`

<details>
  <summary><b>Version History</b></summary>

| Version   | Changes                                                             |
| --------- | ------------------------------------------------------------------- |
| `v10.0.0` | `locale`, `locales`, `defaultLocale`, and `notFound` options added. |
| `v9.3.0`  | `getServerSideProps` introduced.                                    |

</details>

When exporting an `async` function called `getServerSideProps` (server-side rendering) from a page, Next.js will pre-render this page on each request using the data returned by `getServerSideProps`.

```js
export async function getServerSideProps(context) {
  return {
    props: {}, // will be passed to the page component as props
  }
}
```

You can import modules in top-level scope for use in `getServerSideProps`.
Imports used will [**not be bundled for the client-side**](#write-server-side-code-directly). This means you can write **server-side code directly in `getServerSideProps`**, including reading from the filesystem or a database.

You should not use the [`fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) API to call an [API route](/docs/api-routes/introduction.md) in `getServerSideProps`.

Instead, directly import the logic used inside your API route.
You may need to slightly refactor your code for this approach.

The `fetch()` API _can_ be used to fetch external data, such as from a Content Management System (CMS) or API.

## Context parameter

The `context` parameter is an object containing the following keys:

- `params`: If this page uses a [dynamic route](/docs/routing/dynamic-routes.md), `params` contains the route parameters. If the page name is `[id].js` , then `params` will look like `{ id: ... }`.
- `req`: [The `HTTP` IncomingMessage object](https://nodejs.org/api/http.html#http_class_http_incomingmessage).
- `res`: [The `HTTP` response object](https://nodejs.org/api/http.html#http_class_http_serverresponse).
- `query`: An object representing the query string.
- `preview`: `preview` is `true` if the page is in the [Preview Mode](/docs/advanced-features/preview-mode.md) and `false` otherwise.
- `previewData`: The [preview](/docs/advanced-features/preview-mode.md) data set by `setPreviewData`.
- `resolvedUrl`: A normalized version of the request `URL` that strips the `_next/data` prefix for client transitions and includes original query values.
- `locale` contains the active locale (if enabled).
- `locales` contains all supported locales (if enabled).
- `defaultLocale` contains the configured default locale (if enabled).

## `getServerSideProps` return values

The `getServerSideProps` function should return an object with the following **optional** properties:

### `props`

The `props` object is a key value pair, where each value is received by the page component. It should be a [serializable object](https://en.wikipedia.org/wiki/Serialization)

```jsx
export async function getServerSideProps(context) {
  return {
    props: { message: `Next.js is awesome` }, // will be passed to the page component as props
  }
}
```

### `notFound`

The `notFound` boolean allows the page to return a 404 status and page. With `notFound: true` the page will return a 404 even if there was a successfully generated page before. This is meant to support use-cases like user generated content getting removed by its author.

```js
export async function getServerSideProps(context) {
  const res = await fetch(`https://.../data`)
  const data = await res.json()

  if (!data) {
    return {
      notFound: true,
    }
  }

  return {
    props: { data }, // will be passed to the page component as props
  }
}
```

### `redirect`

The `redirect` object to allows redirecting to internal and external resources. It should match the shape of `{ destination: string, permanent: boolean }`. In some rare cases, you might need to assign a custom status code for older `HTTP` Clients to properly redirect. In these cases, you can use the `statusCode` property instead of the `permanent` property, but not both.

```js
export async function getServerSideProps(context) {
  const res = await fetch(`https://.../data`)
  const data = await res.json()

  if (!data) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    }
  }

  return {
    props: {}, // will be passed to the page component as props
  }
}
```
