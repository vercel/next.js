# Next.js Go SDK

The `next/go` module is the Go SDK for Next.js Go handlers, enabled with
`experimental.goRoutes: true`. It ships inside the installed `next` package.

## Proxy helpers

`proxy.go` continues or rewrites requests with `next.Next` and `next.Rewrite`:

```go
package main

import (
    "net/http"
    "next/go"
)

func Proxy(w http.ResponseWriter, r *http.Request) {
    if r.URL.Path == "/old-path" {
        next.Rewrite(w, "/new-path")
        return
    }
    next.Next(w)
}
```

Both accept at most one `next.ProxyOptions` value, whose `Request.Headers`
replaces the downstream request headers. They only set control headers on the
response; Next.js turns them into the proxy result.

## Module mapping

The SDK is the `next/go` module shipped inside the installed `next` package.
`next dev` and `next build` map it in `go.mod` with a requirement and a directory
replacement to its real location, and log when they do, the same way they
reconfigure `tsconfig.json`:

```go
require next/go v0.0.0

replace next/go => ./node_modules/next/go
```

Go only applies a replacement to a required module, so both are needed. Editors,
linters and other Go tools resolve the SDK through this ordinary replacement,
always at the installed Next.js version, without downloads or `go.sum` entries.
Other requirements and `go.sum` are left to Go. With pnpm the replacement names the package's real
directory under `node_modules/.pnpm`, so it changes when Next.js is upgraded, and
the next `next dev` or `next build` updates it. Versioned replacements and Go
workspaces are not supported.
