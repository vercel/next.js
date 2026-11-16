# Static Go entrypoint configuration

Next.js reads static configuration from Go entrypoints the way it reads
`route.ts` and `proxy.ts`. Enable Go handlers with `experimental.goRoutes: true`.
The runtime is always Go.

## `route.go`

Like `route.ts` segment config exports, a route declares separate package-level
values. No SDK import is needed:

```go
package main

const MaxDuration = 30
```

`MaxDuration` is a positive integer literal in seconds, as a `const` or `var`.
When omitted, the deployment platform default applies. `preferredRegion` is
deprecated for `route.ts` and not supported for `route.go`.

## `proxy.go`

Like `proxy.ts`'s `config` export, a proxy declares `var Config` using this
module's `next.ProxyConfig`, `next.Matcher` and `next.RouteHas` types. Only
`Matcher` is supported; an omitted matcher matches all paths.

```go
package main

import next "github.com/vercel/next.js/packages/next/go"

var Config = next.ProxyConfig{
    Matcher: []next.Matcher{
        {Source: "/account/:path*"},
        {Source: "/special", Has: []next.RouteHas{{Type: "header", Key: "x-special"}}},
    },
}
```

Install this Go module at a version or commit containing the SDK:

```sh
go get github.com/vercel/next.js/packages/next/go@<version-or-commit>
```

This downloads the dependency and records it in `go.mod` and `go.sum` before
Next.js builds. Local module replacements and Go workspaces are not supported
by the native Go compiler. The `next` npm package also ships the SDK source.

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
