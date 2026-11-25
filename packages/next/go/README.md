# Next.js Go SDK

The `next/go` module is the Go SDK for Next.js Go handlers, enabled with
`experimental.goRoutes: true`. It ships inside the installed `next` package.

## Proxy helpers

Import `next/go/proxy` to continue or rewrite requests in `proxy.go`:

```go
package main

import (
    "net/http"
    "next/go/proxy"
)

func Proxy(w http.ResponseWriter, r *http.Request) {
    if r.URL.Path == "/old-path" {
        proxy.Rewrite(w, "/new-path")
        return
    }
    proxy.Next(w)
}
```

Use `proxy.WithRequestHeaders(headers)` with either helper to replace downstream
request headers. No option, or `proxy.WithRequestHeaders(nil)`, keeps them unchanged;
`proxy.WithRequestHeaders(http.Header{})` removes them all. Options apply in order,
so the last `WithRequestHeaders` wins.

`next/go` is the module path, not an importable root package. Import its subpackages;
a plain `route.go` needs only the standard library.

## Module mapping

The SDK is the `next/go` module shipped inside the installed `next` package.
Code that imports one of its packages must be in a Go module. Once it does,
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
  package it imports uses a `next/go/*` package, and is never removed, so it agrees with
  `go mod tidy`. During `next dev`, it is added when a route or Proxy file, or a
  package one of them imports, starts importing `next/go`: Next.js updates
  `go.mod` when the handler recompiles, then Turbopack compiles it again.
- **Replacement:** kept pointing at the installed SDK while the module requires
  it. With pnpm it names the package's real directory under `node_modules/.pnpm`,
  so it changes when `next` or one of its peer dependencies is upgraded, and the
  next `next dev` or `next build` updates it. Modules that neither require nor
  import the SDK are left unchanged.
- **Monorepos:** the `go.mod` can be in the application, in a directory nested in
  it, or at the workspace root, and `next` can be installed anywhere inside
  Turbopack's root (`turbopack.root`), such as the workspace's `node_modules`.
- **Libraries:** a Go package that imports `next/go/proxy` requires `next/go v0.0.0` in
  its own `go.mod`. The application's replacement applies to it too, so nothing
  needs to be published. Its own replacement, for developing it on its own, is
  ignored by applications.
- **No module:** Go cannot resolve `next/go` outside a module, so `next dev` and
  `next build` warn about Go files that import it without a `go.mod`.
- **Go version:** the SDK declares `go 1.21`, so modules with a `go 1.21` line or
  newer can use it, even though Next.js requires a Go 1.24 toolchain. Next.js does
  not change the `go` line, and Go does not raise it in `-mod=readonly` builds, so
  raise an older `go` line to at least 1.21.

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

`MaxDuration` is a positive integer literal in seconds, as a `const` or `var`,
untyped or with an integer type. `time.Duration` is rejected, because Go reads `30`
as 30 nanoseconds there. When omitted, the deployment platform default applies. `preferredRegion` is
deprecated for `route.ts` and not supported for `route.go`.

### `proxy.go`

Like `proxy.ts`'s `config` export, a proxy declares `var Config` using this
module's `proxy.Config`, `proxy.Matcher` and `proxy.Condition` types. Only
`Matcher` is supported; an omitted matcher matches all paths.

```go
package main

import "next/go/proxy"

var Config = proxy.Config{
    Matcher: []proxy.Matcher{
        {Source: "/account/:path*"},
        {Source: "/special", Has: []proxy.Condition{{Type: "header", Key: "x-special"}}},
    },
}
```

`Config` must use keyed struct literals, string literals, and nested
`[]proxy.Matcher` / `[]proxy.Condition` literals. Named import aliases work.
`Locale: false` disables locale matching for a matcher; omit it for the default.
Matcher conditions and paths use the existing Next.js validation.

## Static analysis

Only the entrypoint file is read, by Turbopack's Go parser in the same pass that
discovers the handler functions. Calls, environment reads, references to other
variables or constants, arithmetic, and other computed expressions are build
errors. No application code is executed to discover configuration, and runtime
changes to these values do not configure Next.js.
