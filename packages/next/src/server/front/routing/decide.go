package routing

import (
	"strings"
)

// Request is what Decide reads, as the client sent it.
type Request struct {
	Method string
	// The request target from the request line, not decoded.
	Target string
	// "HTTP/1.1", "HTTP/1.0", ...
	Proto string
	// Header fields by canonical name ("Accept-Encoding"), one entry per
	// line the client sent, without Host. An http.Header can be passed as is.
	Header map[string][]string
	// Body length: 0 for none, -1 when unknown (chunked).
	ContentLength int64
}

// Decision is Decide's answer.
type Decision struct {
	// The route.go route that answers the request, or "" when Node does.
	Route string
	// Why the request goes to Node, for debugging. Empty when Route is set.
	Why string
}

func node(why string) Decision { return Decision{Why: why} }

// Decide returns the route.go route that answers r without changing it, or
// "Node" when that isn't certain.
//
// Node rebuilds the URL a route.go handler gets: it parses the query and
// writes it out again, normalizes the path and drops a trailing slash. It
// also redirects some paths, gzips responses, and keeps only the first value
// of some repeated headers. Decide goes direct only for requests where none
// of that changes anything: plain characters in the path and query, and no
// headers Node treats specially. The rest goes to Node, which answers it as
// it always has.
func (t *Table) Decide(r Request) Decision {
	if t.reason != "" {
		return node("app: " + t.reason)
	}
	if why := t.checkRequest(r); why != "" {
		return node(why)
	}
	path, query, hasQuery := strings.Cut(r.Target, "?")
	if hasQuery {
		if why := checkQuery(query); why != "" {
			return node(why)
		}
	}
	segments, why := t.logicalSegments(path)
	if why != "" {
		return node(why)
	}
	return t.match(segments)
}

// headersNodeHandles are request headers that make Node or its HTTP client
// do something a direct request wouldn't: upgrades, 100-continue, hop-by-hop
// fields that Go's proxy and Node's client treat differently.
var headersNodeHandles = []string{"Upgrade", "Expect", "Te", "Trailer", "Proxy-Connection"}

// headerMargin leaves room for how Node counts header bytes (the request
// line, separators) beyond what checkRequest adds up.
const headerMargin = 512

func (t *Table) checkRequest(r Request) string {
	if r.Method == "CONNECT" {
		return "method CONNECT"
	}
	if r.Proto != "HTTP/1.1" {
		return "protocol " + r.Proto
	}
	for _, names := range [][]string{headersNodeHandles, t.nodeHeaders} {
		for _, name := range names {
			if _, ok := r.Header[name]; ok {
				return "header " + name
			}
		}
	}
	size := len(r.Method) + len(r.Target) + len(r.Proto) + 4
	for name, values := range r.Header {
		// Node keeps only the first line of some headers and joins others;
		// with one line per name both are the same.
		if len(values) > 1 {
			return "repeated header " + name
		}
		for _, v := range values {
			size += len(name) + len(v) + 4
		}
	}
	if size > t.maxHeaderBytes-headerMargin {
		return "headers near Node's size limit"
	}
	switch r.Method {
	case "GET", "HEAD", "DELETE", "OPTIONS":
		if r.ContentLength != 0 {
			return "body on " + r.Method
		}
	}
	if t.compress {
		for _, v := range r.Header["Accept-Encoding"] {
			v = strings.ToLower(v)
			// Node's compression middleware could gzip the response.
			if strings.Contains(v, "gzip") || strings.Contains(v, "deflate") || strings.Contains(v, "*") {
				return "client accepts compression"
			}
		}
	}
	return ""
}

// plain reports whether s has only unreserved characters (RFC 3986 §2.3):
// letters, digits, "-", ".", "_" and "~". Those are the same raw, decoded
// and re-encoded, so every reader of the URL sees the same text.
func plain(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !('a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9' || c == '-' || c == '.' || c == '_' || c == '~') {
			return false
		}
	}
	return true
}

// objectPrototypeKeys are names Node's query object already has (it is a
// plain JavaScript object), so a query key with one of these names comes out
// changed or missing.
var objectPrototypeKeys = map[string]bool{
	"__proto__": true, "constructor": true, "hasOwnProperty": true,
	"isPrototypeOf": true, "propertyIsEnumerable": true, "toLocaleString": true,
	"toString": true, "valueOf": true, "__defineGetter__": true,
	"__defineSetter__": true, "__lookupGetter__": true, "__lookupSetter__": true,
}

// checkQuery accepts a query that Node's parse-then-write gives back
// unchanged: key=value pairs of plain characters, no key that JavaScript
// objects order or treat specially, and repeats of a key next to each other
// (Node groups repeats under the first one).
func checkQuery(query string) string {
	if query == "" {
		return "empty query"
	}
	seen := map[string]bool{}
	previous := ""
	for _, pair := range strings.Split(query, "&") {
		key, value, ok := strings.Cut(pair, "=")
		if !ok || key == "" {
			return "query pair without key=value"
		}
		if !plain(key) || !plain(value) {
			return "query characters"
		}
		if isDigits(key) {
			return "integer query key"
		}
		if objectPrototypeKeys[key] {
			return "query key " + key
		}
		if seen[key] && key != previous {
			return "query key repeated apart"
		}
		seen[key] = true
		previous = key
	}
	return ""
}

func isDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return s != ""
}

// logicalSegments checks the path and returns its segments with the basePath
// removed, or why the request goes to Node.
func (t *Table) logicalSegments(path string) ([]string, string) {
	if !strings.HasPrefix(path, "/") {
		return nil, "target not in origin form"
	}
	if t.basePath != "" {
		rest, ok := strings.CutPrefix(path, t.basePath)
		// Node sends the basePath root to the worker as "basePath/".
		if !ok || !strings.HasPrefix(rest, "/") || rest == "/" {
			return nil, "outside basePath or its root"
		}
		path = rest
	}
	for _, prefix := range t.nodePrefixes {
		if strings.HasPrefix(path, prefix) {
			return nil, "node prefix " + prefix
		}
	}
	if path == "/" {
		return []string{}, ""
	}
	segments := strings.Split(path[1:], "/")
	for _, s := range segments {
		switch {
		case s == "":
			return nil, "empty segment or trailing slash"
		case s == "." || s == "..":
			return nil, "dot segment"
		case !plain(s):
			return nil, "path characters"
		}
	}
	return segments, ""
}

// match repeats Node's choice of route: exact paths first, then dynamic
// routes in Node's order.
func (t *Table) match(segments []string) Decision {
	path := "/" + strings.Join(segments, "/")
	if _, ok := t.nodeExact[path]; ok {
		return node("exact Node route")
	}
	if route, ok := t.goExact[path]; ok {
		return Decision{Route: route}
	}
	for _, d := range t.dynamic {
		if matches(d.path, segments) {
			if d.route == "" {
				return node("dynamic Node route")
			}
			return Decision{Route: d.route}
		}
	}
	return node("no route")
}
