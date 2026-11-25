// Package proxy provides helpers for continuing and rewriting requests in proxy.go.
package proxy

import (
	"net/http"
	"sort"
	"strings"
)

// Option configures Next or Rewrite. Options are applied in order.
type Option func(*options)

type options struct {
	requestHeaders http.Header
}

// WithRequestHeaders replaces the downstream request headers. A nil map preserves
// the incoming headers; an empty map removes them all. Names are case-insensitive,
// and values for names that differ only in case are combined. Connection-level
// headers are ignored. When used more than once, the last WithRequestHeaders wins.
func WithRequestHeaders(headers http.Header) Option {
	return func(opts *options) { opts.requestHeaders = headers }
}

// emptyOverride stands in for an empty override list, which Next.js otherwise
// ignores. Listing a header that the request never carries removes every other
// request header without changing JavaScript proxy semantics.
const emptyOverride = "x-next-internal-go-empty-override"

// Next continues routing the request. Call it from Proxy before writing the
// response body. Only a response with this signal continues routing; all
// other responses are terminal, including empty responses.
func Next(w http.ResponseWriter, opts ...Option) {
	applyOptions(w, opts)
	w.Header().Set("x-middleware-next", "1")
}

// Rewrite routes the request to destination while keeping the browser URL.
// Relative destinations resolve against the incoming request URL.
func Rewrite(w http.ResponseWriter, destination string, opts ...Option) {
	applyOptions(w, opts)
	w.Header().Set("x-middleware-rewrite", destination)
}

func applyOptions(w http.ResponseWriter, opts []Option) {
	var config options
	for _, option := range opts {
		option(&config)
	}
	headers := config.requestHeaders
	if headers == nil {
		return
	}
	// Connection-level headers describe the hop to the proxy, not the
	// downstream request, and r.Header.Clone() includes them. Proxy
	// credentials are kept so a cloned map matches passing nil.
	hopByHop := map[string]bool{
		"connection":        true,
		"keep-alive":        true,
		"proxy-connection":  true,
		"te":                true,
		"trailer":           true,
		"transfer-encoding": true,
		"upgrade":           true,
	}
	for key, values := range headers {
		if strings.EqualFold(key, "Connection") {
			for _, value := range values {
				for _, name := range strings.Split(value, ",") {
					if name = strings.TrimSpace(name); name != "" {
						hopByHop[strings.ToLower(name)] = true
					}
				}
			}
		}
	}
	// Iterate in a stable order so values for names that differ only in case
	// are combined deterministically instead of the last map entry winning.
	keys := make([]string, 0, len(headers))
	for key := range headers {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	names := make([]string, 0, len(keys))
	values := make(map[string][]string, len(keys))
	for _, key := range keys {
		name := strings.ToLower(key)
		if hopByHop[name] {
			continue
		}
		if _, seen := values[name]; !seen {
			names = append(names, name)
			values[name] = nil
		}
		values[name] = append(values[name], headers[key]...)
	}
	for _, name := range names {
		w.Header()["x-middleware-request-"+name] = values[name]
	}
	if len(names) == 0 {
		names = append(names, emptyOverride)
	}
	w.Header().Set("x-middleware-override-headers", strings.Join(names, ","))
}
