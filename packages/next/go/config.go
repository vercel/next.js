// Package next defines statically analyzed configuration for Next.js proxy.go.
// Config initializers must use literals; calls and computed values are unsupported.
// route.go needs no types: like route.ts, it declares MaxDuration and PreferredRegion.
package next

// ProxyConfig configures proxy.go like proxy.ts: only matchers are supported.
// An omitted Matcher matches every path.
type ProxyConfig struct {
	Matcher []Matcher
}

// Matcher selects proxy requests using the Next.js matcher syntax.
type Matcher struct {
	Source  string
	Has     []RouteHas
	Missing []RouteHas
	// Locale may be explicitly false to disable locale matching. Omit it for
	// the framework default; the AST distinguishes omission from false.
	Locale bool
}

// RouteHas tests a header, cookie, query parameter, or host.
type RouteHas struct {
	Type  string
	Key   string
	Value string
}
