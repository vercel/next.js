package proxy

// Statically analyzed configuration for proxy.go. Config initializers must use
// literals; calls and computed values are unsupported. route.go needs no types:
// like route.ts, it declares a separate MaxDuration value.

// Config configures which requests proxy.go runs on.
// An omitted Matcher matches every path.
type Config struct {
	Matcher []Matcher
}

// Matcher selects proxy requests using the Next.js matcher syntax.
type Matcher struct {
	Source  string
	Has     []Condition
	Missing []Condition
	// Locale may be explicitly false to disable locale matching. Omit it for
	// the framework default; the AST distinguishes omission from false.
	Locale bool
}

// Condition tests a header, cookie, query parameter, or host for Has or Missing.
type Condition struct {
	Type  string
	Key   string
	Value string
}
