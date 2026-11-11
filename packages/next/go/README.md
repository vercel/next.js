# Static Go entrypoint configuration

This module provides the `next.RouteConfig` and `next.ProxyConfig` types for
Next.js Go handlers. Enable Go handlers with `experimental.goRoutes: true`.
The runtime is always Go.

Install this Go module at a version or commit containing the SDK:

```sh
go get github.com/vercel/next.js/packages/next/go@<version-or-commit>
```

This downloads the dependency and records it in `go.mod` and `go.sum` before
Next.js builds. Local module replacements and Go workspaces are not supported
by the native Go compiler. The `next` npm package also ships the SDK source
and its AST reader.

In `route.go`:

```go
package main

import next "github.com/vercel/next.js/packages/next/go"

var Config = next.RouteConfig{
    MaxDuration: 30,
    PreferredRegion: []string{"iad1"},
}
```

In `proxy.go`:

```go
package main

import next "github.com/vercel/next.js/packages/next/go"

var Config = next.ProxyConfig{
    Matcher: []next.Matcher{
        {Source: "/account/:path*"},
        {Source: "/special", Has: []next.RouteHas{{Type: "header", Key: "x-special"}}},
    },
    MaxDuration: 30,
    PreferredRegion: []string{"iad1"},
}
```

Only the entrypoint file's package-level `var Config` is read. Initializers must
use keyed struct literals, integer and string literals, `[]string` literals, and
nested `[]next.Matcher` / `[]next.RouteHas` literals. Named import aliases work.
`Locale: false` disables locale matching for a matcher; omit it for the default.
Calls, environment reads, references to other variables or constants, arithmetic,
and other computed expressions are build errors. No application code is executed
to discover configuration. Runtime changes to `Config` do not configure Next.js.

`MaxDuration` is a positive integer in seconds. `PreferredRegion` is a nonempty
slice of nonempty strings. Omitted duration and regions use framework/platform
defaults. An omitted matcher matches all paths. Matcher conditions and paths use
the existing Next.js validation. `Matcher` is supported only on `ProxyConfig`.
