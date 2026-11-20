package routing

import (
	"strings"
	"unicode/utf8"
)

// Request is what Decide reads, as the client sent it.
type Request struct {
	Method string
	// The request target from the request line, not decoded.
	Target string
	// "HTTP/1.1", "HTTP/1.0", ...
	Proto string
	// Host is separate because HTTP servers remove it from Header.
	Host string
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
// also redirects some paths and keeps only the first value of some repeated
// headers. Decide goes direct only for requests where none of that changes
// anything: plain characters in the path and query, and no headers Node
// treats specially. The rest goes to Node, which answers it as it always
// has.
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
	logical, segments, why := t.logicalPath(path)
	if why != "" {
		return node(why)
	}
	return t.match(logical, segments)
}

// headersNodeHandles are request headers that make Node or its HTTP client
// do something a direct request wouldn't: upgrades, 100-continue, hop-by-hop
// fields that Go's proxy and Node's client treat differently. With an
// Idempotency-Key, Go's client may send a bodyless request again when the
// worker closes a reused connection before answering; Node's never does.
var headersNodeHandles = []string{"Upgrade", "Expect", "Te", "Trailer", "Proxy-Connection", "Idempotency-Key", "X-Idempotency-Key"}

// headerMargin leaves room for how Node counts header bytes (the request
// line, separators) beyond what checkRequest adds up.
const headerMargin = 512

func (t *Table) checkRequest(r Request) string {
	// Go's server accepts any token as a method. Node's parser accepts only
	// its own list, in uppercase, and answers 400 to the rest ("get",
	// "FOO"), so only the common methods go direct.
	switch r.Method {
	case "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS":
	default:
		return "method " + r.Method
	}
	if r.Proto != "HTTP/1.1" {
		return "protocol " + r.Proto
	}
	// The client's Connection header can name other headers. Node's worker
	// proxy removes those after filling in X-Forwarded-*, so a named Host,
	// X-Forwarded-For or Content-Length reaches the worker missing or
	// changed; Switchyard's proxy puts them back. "close" and "keep-alive"
	// name no other header.
	for _, v := range r.Header["Connection"] {
		for _, token := range strings.Split(v, ",") {
			switch strings.ToLower(strings.TrimSpace(token)) {
			case "", "close", "keep-alive":
			default:
				return "Connection names a header"
			}
		}
	}
	for _, names := range [][]string{headersNodeHandles, t.nodeHeaders} {
		for _, name := range names {
			if _, ok := r.Header[name]; ok {
				return "header " + name
			}
		}
	}
	size := len(r.Method) + len(r.Target) + len(r.Proto) + 4 + len("Host") + len(r.Host) + 4
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
	if r.ContentLength != 0 {
		return "request body"
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
// unchanged: key=value pairs already in the form Node writes
// (canonicalQueryText), no key that JavaScript objects order or treat
// specially, and repeats of a key next to each other (Node groups repeats
// under the first one).
//
// TODO: every other query goes to Node, which rewrites it before calling
// the worker. Without Node, Switchyard would have to send Node's rewritten
// form itself: "+" as a space, characters Node percent-encodes (",", ";",
// "=", ...), encodings Node writes differently (lowercase hex, or "%7E" for
// a character it leaves raw), invalid percent-encodings and UTF-8, empty
// pairs and pairs without "=", number-like keys (sorted first), keys
// JavaScript objects already have, and repeats of a key apart.
func checkQuery(query string) string {
	if query == "" {
		return "empty query"
	}
	seen := map[string]bool{}
	previous := ""
	for _, pair := range strings.Split(query, "&") {
		key, value, ok := strings.Cut(pair, "=")
		if !ok {
			return "query pair without key=value"
		}
		if !canonicalQueryText(key) || !canonicalQueryText(value) {
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

// canonicalQueryText reports whether s, a query key or value, is already
// written the way Node writes it: Node decodes the query (URLSearchParams)
// and encodes it again with querystring.escape, which leaves letters, digits
// and -_.!~*'() as they are and writes every other byte as %XX with
// uppercase hex. Only text in that form reaches the worker unchanged. Letters
// and digits are never encoded in it, so the key checks above can read the
// key as sent.
func canonicalQueryText(s string) bool {
	// Text without "%" is all raw characters (ASCII), so only text with an
	// encoding needs its decoded bytes checked as UTF-8.
	encoded := strings.IndexByte(s, '%') >= 0
	var decoded []byte
	if encoded {
		decoded = make([]byte, 0, len(s))
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c != '%' {
			if !queryRaw(c) {
				return false
			}
			if encoded {
				decoded = append(decoded, c)
			}
			continue
		}
		if i+2 >= len(s) {
			return false
		}
		hi, ok1 := upperHex(s[i+1])
		lo, ok2 := upperHex(s[i+2])
		if !ok1 || !ok2 {
			return false
		}
		b := hi<<4 | lo
		// Node would write this byte as is, so the encoding changes.
		if queryRaw(b) {
			return false
		}
		decoded = append(decoded, b)
		i += 2
	}
	// Node replaces invalid UTF-8 with U+FFFD.
	return !encoded || utf8.Valid(decoded)
}

// queryRaw reports whether querystring.escape leaves c as it is.
func queryRaw(c byte) bool {
	return 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9' || strings.IndexByte("-_.!~*'()", c) >= 0
}

// upperHex reads one uppercase hex digit, as querystring.escape writes them.
func upperHex(c byte) (byte, bool) {
	switch {
	case '0' <= c && c <= '9':
		return c - '0', true
	case 'A' <= c && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}

func isDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return s != ""
}

// logicalPath checks the path and returns it and its segments, or why the
// request goes to Node.
func (t *Table) logicalPath(path string) (string, []string, string) {
	if !strings.HasPrefix(path, "/") {
		return "", nil, "target not in origin form"
	}
	for _, prefix := range t.nodePrefixes {
		if strings.HasPrefix(path, prefix) {
			return "", nil, "node prefix " + prefix
		}
	}
	if path == "/" {
		return path, nil, ""
	}
	segments := strings.Split(path[1:], "/")
	for _, s := range segments {
		switch {
		case s == "":
			return "", nil, "empty segment or trailing slash"
		case s == "." || s == "..":
			return "", nil, "dot segment"
		case !plain(s):
			return "", nil, "path characters"
		}
	}
	return path, segments, ""
}

// match repeats Node's choice of route: exact paths first, then dynamic
// routes in Node's order.
func (t *Table) match(path string, segments []string) Decision {
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
