# Native Go proxy

Enable the experiment with `experimental.goProxy: { matcher: ['/protected/:path*'] }`.
Put `proxy.go` beside `app` or `pages` (including in `src`) and provide:

```go
package main

import "net/http"

func Proxy(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("x-proxy", "go")
    Next(w)
}
```

The generated helpers are `Next(w)`, `Rewrite(w, destination)`, and
`OverrideRequestHeaders(w, headers)`. A response without a continuation or rewrite
header finishes the request. Ordinary Go HTTP handlers, cookies, redirects and
streaming are supported. Relative rewrite and redirect URLs resolve against the
incoming public URL. Matchers use the existing Next.js matcher syntax, including
`has`, `missing`, and locale rules. `maxDuration` and `preferredRegion` can also be
set in `experimental.goProxy`.

Only one proxy is allowed; Go and JavaScript proxies cannot be combined.
Go compilation requires Turbopack and a Go toolchain. There is no Edge runtime.
Self-hosted builds use an authenticated local worker; adapter builds emit a Go
middleware executable using the platform's PORT-based HTTP server contract.
Background work after the HTTP response is not an invocation-lifetime API.

The root fixture is a proxy-only application. `src-fixture` also has a Go route
handler to exercise continuation, rewrite and header override interoperability.
