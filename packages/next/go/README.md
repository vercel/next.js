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
Code that imports it must be in a Go module. Once your Go code imports it,
`next dev` and `next build` add a requirement and a directory replacement to its
real location in `go.mod`. They log when they change `go.mod`, the same way they
reconfigure `tsconfig.json`:

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
- **Replacement:** kept pointing at the installed SDK while the module requires
  it. With pnpm it names the package's real directory under `node_modules/.pnpm`,
  so it changes when Next.js is upgraded, and the next `next dev` or `next build`
  updates it. Modules that neither require nor import the SDK are left unchanged.
- **Monorepos:** the `go.mod` can be in the application, in a directory nested in
  it, or at the workspace root, and `next` can be installed anywhere inside
  Turbopack's root (`turbopack.root`), such as the workspace's `node_modules`.
- **Libraries:** a Go package that imports `next/go` requires `next/go v0.0.0` in
  its own `go.mod`. The application's replacement applies to it too, so nothing
  needs to be published. Its own replacement, for developing it on its own, is
  ignored by applications.
- **No module:** Go cannot resolve `next/go` outside a module, so `next dev` and
  `next build` warn about Go files that import it without a `go.mod`.
- **Go version:** the SDK declares `go 1.21`, so application modules with an older
  `go` line than the Go 1.24 toolchain Next.js requires can still use it.

Other requirements and `go.sum` are left to Go. Versioned replacements and Go
workspaces are not supported.

## Static configuration

Next.js reads static configuration from Go entrypoints the way it reads
`route.ts` and `proxy.ts`.

### `route.go`

Like `route.ts` segment config exports, a route declares separate package-level
values. No SDK import is needed:

```go
package main

const MaxDuration = 30
```

`MaxDuration` is a positive integer literal in seconds, as a `const` or `var`.
When omitted, the deployment platform default applies. `preferredRegion` is
deprecated for `route.ts` and not supported for `route.go`.

### `proxy.go`

Like `proxy.ts`'s `config` export, a proxy declares `var Config` using this
module's `next.ProxyConfig`, `next.Matcher` and `next.RouteHas` types. Only
`Matcher` is supported; an omitted matcher matches all paths.

```go
package main

import "next/go"

var Config = next.ProxyConfig{
    Matcher: []next.Matcher{
        {Source: "/account/:path*"},
        {Source: "/special", Has: []next.RouteHas{{Type: "header", Key: "x-special"}}},
    },
}
```

`Config` must use keyed struct literals, string literals, and nested
`[]next.Matcher` / `[]next.RouteHas` literals. Named import aliases work.
`Locale: false` disables locale matching for a matcher; omit it for the default.
Matcher conditions and paths use the existing Next.js validation.

## Static analysis

Only the entrypoint file is read, by Turbopack's Go parser in the same pass that
discovers the handler functions. Calls, environment reads, references to other
variables or constants, arithmetic, and other computed expressions are build
errors. No application code is executed to discover configuration, and runtime
changes to these values do not configure Next.js.
