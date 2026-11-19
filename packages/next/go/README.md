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

## Browser assets: `next/go/assets`

A `route.go` handler can render Turbopack-built JavaScript, TypeScript and CSS.
Import `next/go/assets`; it uses the same module mapping as the rest of the SDK.

### Declare and render an entrypoint

```go
// app/dashboard/route.go
package main

import (
  "fmt"
  "net/http"

  "next/go/assets"
)

var dashboard = assets.Browser("app/dashboard/client.ts")

func GET(w http.ResponseWriter, r *http.Request) {
  w.Header().Set("Content-Type", "text/html")
  fmt.Fprint(w, "<!doctype html><html><head>")
  if err := assets.RenderTags(w, dashboard); err != nil {
    panic(err)
  }
  fmt.Fprint(w, "</head><body><main id=\"dashboard\"></main></body></html>")
}
```

```ts
// app/dashboard/client.ts
import './styles.css'

document.querySelector('#dashboard')!.textContent = 'Hello from the browser'
```

`Browser` constructs an ordinary Go handle without I/O. Declare it in a direct
package-level variable initializer in `route.go` with one string literal relative
to the Next application root. The package name is `assets`. Named import aliases also work. Turbopack discovers these
declarations without evaluating Go expressions or executing application code.
Sibling files and transitive Go packages are outside discovery; they can receive
and render handles declared in `route.go`.

Turbopack builds every declared entrypoint for production, including handles that
a handler renders conditionally. JS/TS imports include CSS and lazy chunks from
dynamic imports. Imported CSS needs no separate Go declaration.

Pass multiple handles together to deduplicate shared initial resources:

```go
err := assets.RenderTags(w, dashboard, navigation)
```

Stylesheets precede ordered deferred scripts. Dynamic imports remain lazy. The
browser chunk group's runtime and bootstrap are included automatically.

### Use html/template

Register a function for each request:

```go
functions := template.FuncMap{
  "assetTags": func() (template.HTML, error) {
    return assets.Tags(w, dashboard, navigation)
  },
}
```

Use `{{ assetTags }}` in the template. `Tags` resolves all requested handles before
returning trusted HTML and an error. URLs are HTML-escaped. `RenderTags` similarly
resolves all handles before writing, and propagates output errors.

Both helpers need the route response writer. Response-writer middleware can
preserve the manifest binding through `Unwrap() http.ResponseWriter`. Template
output may go to another writer; capture the original response writer in the
registered function.

### Asset generations

The generated adapter supplies an immutable manifest snapshot to each request.
JS/CSS dependency edits reload the document in development without recompiling or
restarting its Go worker. Browser assets are served by Next's asset pipeline;
bundle bytes are not embedded in Go executables. Native deployment adapter outputs
carry the manifest beside the executable.

Go continues to own package resolution, compilation and linking. The SDK does not
execute JavaScript on the server or create Go-to-JavaScript function bindings.

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

Run SDK checks with `go test ./...` from this directory.
