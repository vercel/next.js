# Native Go proxy

Enable both `route.go` and `proxy.go` with `experimental.goRoutes: true`.
The proxy matches all paths in this first version.
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
incoming public URL.

Only one proxy is allowed; Go and JavaScript proxies cannot be combined.
Go compilation requires Turbopack and a Go toolchain. There is no Edge runtime.
Self-hosted builds use an authenticated local worker; adapter builds emit a Go
middleware executable using the platform's PORT-based HTTP server contract.
Background work after the HTTP response is not an invocation-lifetime API.

`http.SetCookie` writes response cookies. Like an ordinary JavaScript `Response`
with a `Set-Cookie` header, it does not update `cookies()` in the current render.
Go proxies do not yet provide a `NextResponse.cookies`-style helper.

Go keeps the request Host in `r.Host`, outside `r.Header`. When cloning headers
for `OverrideRequestHeaders`, explicitly set `headers.Set("Host", r.Host)` if
the downstream request should retain Host.

The root fixture is a proxy-only application. `src-fixture` also has a Go route
handler to exercise continuation, rewrite and header override interoperability.

The suite currently runs in Turbopack dev and start modes. Hosted CI still uses
the released adapter and builder, which do not provision Go for proxy-only apps
or package Go middleware. Enable deploy mode after the companion
[adapter change](https://github.com/nextjs/adapter-vercel/pull/156) and builder
change are released and selected by the deployment harness. Start mode already
verifies the emitted middleware executable's PORT-based HTTP contract in an
isolated directory without Next.js.
