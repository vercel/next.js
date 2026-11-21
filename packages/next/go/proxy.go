// Package next is the Go SDK for Next.js Go handlers. It ships inside the
// installed next package; Next.js maps the next/go module there in go.mod.
package next

import (
	"net/http"
	"sort"
	"strings"
)

// ProxyOptions configures the request forwarded by Next or Rewrite.
type ProxyOptions struct {
	Request RequestOptions
}

// RequestOptions contains downstream request overrides.
type RequestOptions struct {
	// A nil map preserves the request headers. A non-nil map replaces them;
	// an empty map removes them. Names are case-insensitive: values for names
	// that differ only in case are combined. Hop-by-hop headers, such as
	// Connection and the headers it lists, are ignored.
	Headers http.Header
}

// emptyOverride stands in for an empty override list, which Next.js otherwise
// ignores. Listing a header that the request never carries removes every other
// request header without changing JavaScript proxy semantics.
const emptyOverride = "x-next-internal-go-empty-override"

// Next continues routing the request. Call it from Proxy before writing the
// response body. Only a response with this signal continues routing; all
// other responses are terminal, including empty responses.
func Next(w http.ResponseWriter, options ...ProxyOptions) {
	applyOptions(w, options)
	w.Header().Set("x-middleware-next", "1")
}

// Rewrite routes the request to destination while keeping the browser URL.
// Relative destinations resolve against the incoming request URL.
func Rewrite(w http.ResponseWriter, destination string, options ...ProxyOptions) {
	applyOptions(w, options)
	w.Header().Set("x-middleware-rewrite", destination)
}

func applyOptions(w http.ResponseWriter, options []ProxyOptions) {
	if len(options) > 1 {
		panic("Next and Rewrite accept at most one ProxyOptions value")
	}
	if len(options) == 0 || options[0].Request.Headers == nil {
		return
	}
	headers := options[0].Request.Headers
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
