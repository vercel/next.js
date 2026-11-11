// Package next defines statically analyzed configuration for Next.js Go entrypoints.
// Config initializers must use literals; calls and computed values are unsupported.
package next

// RouteConfig configures one route.go handler. MaxDuration is in seconds.
// Omitted fields use the framework or deployment platform defaults.
type RouteConfig struct {
	MaxDuration     int
	PreferredRegion []string
}

// ProxyConfig configures proxy.go. An omitted Matcher matches every path.
type ProxyConfig struct {
	Matcher         []Matcher
	MaxDuration     int
	PreferredRegion []string
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
