---
title: allowedDevOrigins
description: Use `allowedDevOrigins` to configure additional origins that can request the dev server.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

Next.js blocks cross-origin requests to dev-only assets and endpoints during development by default to prevent unauthorized access.

To configure a Next.js application to allow requests from origins other than the hostname the server was initialized with (`localhost` by default), use the `allowedDevOrigins` config option.

`allowedDevOrigins` lets you set additional origins that can request the dev server in development mode. For example, to use `local-origin.dev` instead of only `localhost`, open `next.config.js` and add the `allowedDevOrigins` config:

```js filename="next.config.js"
module.exports = {
  allowedDevOrigins: ['local-origin.dev', '*.local-origin.dev'],
}
```

Only the [`hostname`](https://developer.mozilla.org/en-US/docs/Web/API/URL/hostname) of the request's `Origin` header is matched against your entries. For a request from `http://local-origin.dev:3000/dashboard?tab=1`, that is `local-origin.dev`. The scheme, the port, the path, and the query string are ignored. Write your entries that way too, without `https://` and without a port.

A no-cors cross-site request, such as a script tag loading a dev asset, sends no `Origin` header. Those are matched on the `Referer` hostname instead.

Entries can also expand, through two wildcards: a `*` stands in for exactly one label of the hostname, and `**` for one or more. That is why the example above lists two entries, one for the bare hostname and one for its subdomains.

| Entry                 | Matches                                             | Does not match                                 |
| --------------------- | --------------------------------------------------- | ---------------------------------------------- |
| `local-origin.dev`    | `local-origin.dev`                                  | `team.local-origin.dev`                        |
| `*.local-origin.dev`  | `team.local-origin.dev`                             | `local-origin.dev`, `team.eu.local-origin.dev` |
| `**.local-origin.dev` | `team.local-origin.dev`, `team.eu.local-origin.dev` | `local-origin.dev`                             |

Partial replacement is not supported. Write `*.local-origin.dev`, rather than `team-*.local-origin.dev`. Using `**` is only supported at the start of the pattern.

The dev server already allows `localhost`, its subdomains, and the hostname it was started with. Any other hostname needs an entry, such as a tunnel used for remote development:

```js filename="next.config.js"
module.exports = {
  allowedDevOrigins: ['*.tunnel.example.com'],
}
```
