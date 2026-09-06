---
title: serverActions
description: Configure Server Actions behavior in your Next.js application.
related:
  links:
    - app/guides/server-actions
---

Options for configuring Server Actions behavior in your Next.js application. For how Server Actions work, including the security boundary these options tune, see the [Server Actions guide](/docs/app/guides/server-actions).

## `allowedOrigins`

A list of extra safe hosts from which Server Actions can be invoked. To prevent CSRF attacks, Next.js compares the host in a request's `Origin` header against the app's own host, taken from `x-forwarded-host` or `host`, and rejects the action when the two differ. If not provided, only the same origin is allowed. A request that carries no `Origin` header at all is allowed through with a warning rather than rejected.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */

module.exports = {
  experimental: {
    serverActions: {
      allowedOrigins: ['my-proxy.com', '*.my-proxy.com'],
    },
  },
}
```

Only the [`host`](https://developer.mozilla.org/en-US/docs/Web/API/URL/host) of the request's `Origin` header is matched against your entries, which is the hostname plus the port when the URL carries one. For a request from `https://my-proxy.com/checkout`, that is `my-proxy.com`. For one from `https://my-proxy.com:8443/checkout`, `my-proxy.com:8443`. Write your entries the same way.

Entries can also expand, through two wildcards: a `*` stands in for exactly one label of the host, and `**` for one or more. That is why the example above lists two entries, one for the bare host and one for its subdomains.

| Entry               | Matches                                   | Does not match                          |
| ------------------- | ----------------------------------------- | --------------------------------------- |
| `my-proxy.com`      | `my-proxy.com`                            | `my-proxy.com:8443`, `app.my-proxy.com` |
| `*.my-proxy.com`    | `app.my-proxy.com`                        | `my-proxy.com`, `app.my-proxy.com:8443` |
| `**.my-proxy.com`   | `app.my-proxy.com`, `app.eu.my-proxy.com` | `my-proxy.com`                          |
| `my-proxy.com:8443` | `my-proxy.com:8443`                       | `my-proxy.com`                          |

Partial replacement is not supported. Write `*.my-proxy.com`, rather than `app-*.my-proxy.com`. Using `**` is only supported at the start of the pattern. A port cannot be wildcarded, so write it out in full: `my-proxy.com:8443`, or `*.my-proxy.com:8443` for its subdomains.

Behind a reverse proxy, no entry is needed as long as the proxy forwards the public host in `x-forwarded-host`. When it forwards its own host instead, the browser sends `my-proxy.com` while the server reports something like `localhost:3000`, and that mismatch is what this list is for: the host visible in the browser's address bar is the one to add, not the internal one the server reports.

The check runs in production as well as in development, so the list applies to your deployed app and not only to local work.

For example, remote development through a tunnel needs the tunnel hostname in two places: in [`allowedDevOrigins`](/docs/app/api-reference/config/next-config-js/allowedDevOrigins), so the dev server serves its own assets and endpoints, and here, so actions from it are accepted:

```js filename="next.config.js"
/** @type {import('next').NextConfig} */

module.exports = {
  allowedDevOrigins: ['*.tunnel.example.com'],
  experimental: {
    serverActions: {
      allowedOrigins: ['*.tunnel.example.com'],
    },
  },
}
```

## `bodySizeLimit`

By default, the maximum size of the request body sent to a Server Action is 1MB, to prevent the consumption of excessive server resources in parsing large amounts of data, as well as potential DDoS attacks.

However, you can configure this limit using the `serverActions.bodySizeLimit` option. It can take the number of bytes or any string format supported by bytes, for example `1000`, `'500kb'` or `'3mb'`.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */

module.exports = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}
```

The limit applies to the raw HTTP request body, including the bytes that `multipart/form-data` adds for boundaries, part headers, and field metadata. If you expect uploads close to the configured value, leave some room for this overhead. For typical multipart uploads, an additional 10–20 KB is a reasonable rule of thumb.

## Enabling Server Actions (v13)

Server Actions became a stable feature in Next.js 14, and are enabled by default. However, if you are using an earlier version of Next.js, you can enable them by setting `experimental.serverActions` to `true`.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    serverActions: true,
  },
}

module.exports = config
```
