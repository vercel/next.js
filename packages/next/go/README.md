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
`next dev` and `next build` map it in `go.mod` with a directory replacement to its
real location and, once your Go code imports it, a requirement. They log when they
change `go.mod`, the same way they reconfigure `tsconfig.json`:

```go
require next/go v0.0.0

replace next/go => ./node_modules/next/go
```

Editors, linters and other Go tools resolve the SDK through this ordinary
replacement, always at the installed Next.js version, without downloads or
`go.sum` entries.

- **Requirement:** Go ignores a replacement for a module that is not required. The
  requirement is added only when a Go source in the project, its tests, or a
  package it imports uses `next/go`, and is never removed, so it agrees with
  `go mod tidy`. During `next dev`, editing a Go source in the project adds it.
- **Replacement:** kept pointing at the installed SDK. With pnpm it names the
  package's real directory under `node_modules/.pnpm`, so it changes when Next.js
  is upgraded, and the next `next dev` or `next build` updates it.
- **Monorepos:** the `go.mod` can be in the application, in a directory nested in
  it, or at the workspace root, and `next` can be installed anywhere inside
  Turbopack's root (`turbopack.root`), such as the workspace's `node_modules`.
- **Libraries:** a Go package that imports `next/go` requires `next/go v0.0.0` in
  its own `go.mod`. The application's replacement applies to it too, so nothing
  needs to be published. Its own replacement, for developing it on its own, is
  ignored by applications.

Other requirements and `go.sum` are left to Go. Versioned replacements and Go
workspaces are not supported.
