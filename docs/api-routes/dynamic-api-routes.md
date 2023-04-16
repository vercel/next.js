---
description: You can add the dynamic routes used for pages to API Routes too. Learn how it works here.
---

# Dynamic API Routes

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes">Basic API Routes</a></li>
  </ul>
</details>

API routes support [dynamic routes](/docs/routing/dynamic-routes.md), and follow the same file naming rules used for `pages`.

For example, the API route `pages/api/note/[pid].js` has the following code:

```js
export default function handler(req, res) {
  const { nid } = req.query
  res.end(`Note: ${nid}`)
}
```

Now, a request to `/api/note/abc` will respond with the text: `Note: abc`.

### Index routes and Dynamic API routes

A very common RESTful pattern is to set up routes like this:

- `GET api/notes` - gets a list of notes, probably paginated
- `GET api/notes/12345` - gets note id 12345

We can model this in two ways:

- Option 1:
  - `/api/notes.js`
  - `/api/notes/[noteId].js`
- Option 2:
  - `/api/notes/index.js`
  - `/api/notes/[noteId].js`

Both are equivalent. A third option of only using `/api/notes/[noteId].js` is not valid because Dynamic Routes (including Catch-all routes - see below) do not have an `undefined` state and `GET api/notes` will not match `/api/notes/[noteId].js` under any circumstances.

### Catch all API routes

API Routes can be extended to catch all paths by adding three dots (`...`) inside the brackets. For example:

- `pages/api/note/[...slug].js` matches `/api/note/a`, but also `/api/note/a/b`, `/api/note/a/b/c` and so on.

> **Note**: You can use names other than `slug`, such as: `[...param]`

Matched parameters will be sent as a query parameter (`slug` in the example) to the page, and it will always be an array, so, the path `/api/note/a` will have the following `query` object:

```json
{ "slug": ["a"] }
```

And in the case of `/api/note/a/b`, and any other matching path, new parameters will be added to the array, like so:

```json
{ "slug": ["a", "b"] }
```

An API route for `pages/api/note/[...slug].js` could look like this:

```js
export default function handler(req, res) {
  const { slug } = req.query
  res.end(`Note: ${slug.join(', ')}`)
}
```

Now, a request to `/api/note/a/b/c` will respond with the text: `Note: a, b, c`.

### Optional catch all API routes

Catch all routes can be made optional by including the parameter in double brackets (`[[...slug]]`).

For example, `pages/api/note/[[...slug]].js` will match `/api/note`, `/api/note/a`, `/api/note/a/b`, and so on.

The main difference between catch all and optional catch all routes is that with optional, the route without the parameter is also matched (`/api/note` in the example above).

The `query` objects are as follows:

```json
{ } // GET `/api/note` (empty object)
{ "slug": ["a"] } // `GET /api/note/a` (single-element array)
{ "slug": ["a", "b"] } // `GET /api/note/a/b` (multi-element array)
```

## Caveats

- Predefined API routes take precedence over dynamic API routes, and dynamic API routes over catch all API routes. Take a look at the following examples:
  - `pages/api/note/create.js` - Will match `/api/note/create`
  - `pages/api/note/[pid].js` - Will match `/api/note/1`, `/api/note/abc`, etc. But not `/api/note/create`
  - `pages/api/note/[...slug].js` - Will match `/api/note/1/2`, `/api/note/a/b/c`, etc. But not `/api/note/create`, `/api/note/abc`

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/routing/dynamic-routes.md">
    <b>Dynamic Routes:</b>
    <small>Learn more about the built-in dynamic routes.</small>
  </a>
</div>
