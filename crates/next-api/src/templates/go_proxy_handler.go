package __NEXT_GO_PACKAGE__

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Proxy calls proxy.Next and proxy.Rewrite from next/go/proxy, which only set
// control headers. This writer turns those headers into the proxy response.
type nextGoProxyWriter struct {
	http.ResponseWriter
	request     *http.Request
	rewriteHost string
	wroteHeader bool
}

func (w *nextGoProxyWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *nextGoProxyWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	if status >= 200 {
		w.wroteHeader = true
		// Control-response headers also reach the downstream request. Do not
		// replace its Date with net/http's automatic response Date, but retain
		// a Date explicitly set by the proxy.
		if w.Header().Get("x-middleware-next") != "" || w.Header().Get("x-middleware-rewrite") != "" {
			// Make proxy-set cookies available to cookies() in this request's
			// downstream render, matching NextResponse.cookies.set().
			if cookies := w.Header().Values("Set-Cookie"); len(cookies) > 0 {
				w.Header().Set("x-middleware-set-cookie", strings.Join(cookies, ","))
			}
			if _, explicit := w.Header()["Date"]; !explicit {
				w.Header()["Date"] = nil
			}
		}
		// Go permits relative redirects and rewrites. The Next adapter consumes
		// absolute URLs, and the platform can then make same-origin URLs relative.
		// Preserve RawPath, RawQuery and ForceQuery when resolving references.
		base := *w.request.URL
		base.Scheme = nextGoForwardedProto(w.request.Header.Get("X-Forwarded-Proto"))
		base.Host = w.rewriteHost
		if base.Host == "" {
			base.Host = w.request.Host
		}
		for _, key := range []string{"Location", "x-middleware-rewrite"} {
			if value := w.Header().Get(key); value != "" {
				if destination, err := url.Parse(value); err == nil {
					w.Header().Set(key, base.ResolveReference(destination).String())
				}
			}
		}
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *nextGoProxyWriter) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func (w *nextGoProxyWriter) Flush() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	_ = http.NewResponseController(w.ResponseWriter).Flush()
}

// nextGoForwardedProto returns the client-facing scheme. Proxies may append
// their own hop to X-Forwarded-Proto, so only the first entry is used.
func nextGoForwardedProto(value string) string {
	first, _, _ := strings.Cut(value, ",")
	switch scheme := strings.ToLower(strings.TrimSpace(first)); scheme {
	case "http", "https":
		return scheme
	}
	return "http"
}

// Proxy configuration, replaced when the proxy is compiled.
const nextGoSkipProxyURLNormalize = false
const nextGoProxyBasePath = ""

const nextGoProxyMaxQueryBytes = 64 << 10
const nextGoProxyMaxQueryParams = 4096

// nextGoNormalizeURL rewrites the request URL to the one the JavaScript
// adapter passes to proxy.ts as request.url, but is stricter where proxy.ts
// can authorize a different resource from the one the route handler uses.
// Transport suffixes apply only to the pathname, before percent decoding, so
// query values keep a trailing .rsc. Client query names are never routing
// metadata, so nxtP/nxtI names are not promoted. Pages data URLs are rejected
// because proxy.go only supports App Router applications, whose catch-all
// handlers can otherwise reinterpret them, and so are paths that would still
// carry an RSC suffix after decoding (see nextGoHasRSCSegment), and targets
// with a literal #, which proxy.ts would drop as a fragment but Go handlers do
// not.
func nextGoNormalizeURL(r *http.Request) bool {
	target := r.RequestURI
	if !strings.HasPrefix(target, "/") {
		target = r.URL.EscapedPath()
		if r.URL.ForceQuery || r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
	}
	// Clients never send a fragment, and Go's HTTP server does not treat # as
	// one: a route.go handler that receives the original target parses query
	// fields after it. Truncating here would hide those fields from Proxy, so
	// reject a literal # instead.
	if strings.Contains(target, "#") {
		return false
	}
	rawPath, rawQuery, hasQuery := strings.Cut(target, "?")
	path := nextGoParsePath(rawPath)
	path = nextGoNormalizeRSCPath(path)
	// Assigning URL.pathname reparses dot segments. If removing a transport
	// suffix exposes one, such as /a/...rsc becoming /a/.. and then /, the proxy
	// could authorize the parent while an adapter routes the original path to a
	// protected handler. Reject literal and percent-encoded forms instead.
	reparsedPath := nextGoParsePath(path)
	if reparsedPath != path {
		return false
	}
	path = reparsedPath
	if nextGoIsDataPath(path) || nextGoHasRSCSegment(path) {
		return false
	}
	query := ""
	if nextGoSkipProxyURLNormalize {
		query = nextGoPercentEncode(rawQuery, nextGoQueryEscape)
	} else {
		query = nextGoNormalizeQuery(rawQuery)
		hasQuery = query != ""
	}
	unescaped, err := url.PathUnescape(path)
	if err != nil {
		return false
	}
	r.URL.Path = unescaped
	r.URL.RawPath = path
	r.URL.RawQuery = query
	r.URL.ForceQuery = hasQuery && query == ""
	r.RequestURI = path
	if hasQuery {
		r.RequestURI += "?" + query
	}
	return true
}

func nextGoIsDataPath(path string) bool {
	if nextGoProxyBasePath != "" && strings.HasPrefix(path, nextGoProxyBasePath+"/") {
		path = strings.TrimPrefix(path, nextGoProxyBasePath)
	}
	return path == "/_next/data" || strings.HasPrefix(path, "/_next/data/")
}

// nextGoHasRSCSegment reports whether a decoded path segment still matches
// the RSC suffix after the transport suffix has been removed. Depending on how
// a route is invoked, such as directly by an adapter or in the Edge runtime,
// its dynamic params are decoded and then have that suffix stripped again, so
// /a/private%2Ersc or /a/private.rsc.rsc can reach the handler as private or
// private.rsc while Proxy authorized private.rsc or private.rsc.rsc. Such
// paths are rejected rather than authorized as an ambiguous resource. The
// check mirrors normalizeRscURL: .rsc at the end or before a `?`.
func nextGoHasRSCSegment(path string) bool {
	for _, segment := range strings.Split(path, "/") {
		decoded, err := url.PathUnescape(segment)
		if err != nil {
			return true
		}
		if strings.HasSuffix(decoded, ".rsc") || strings.Contains(decoded, ".rsc?") {
			return true
		}
	}
	return false
}

// Match SegmentPrefixRSCPathnameNormalizer before the ordinary RSC suffix,
// exactly as App Router dispatch does. Do not strip a second suffix from the
// parent page or interpret an encoded suffix as transport metadata.
func nextGoNormalizeRSCPath(path string) string {
	if strings.HasSuffix(path, ".segment.rsc") {
		if i := strings.LastIndex(path, ".segments/"); i > 0 {
			return path[:i]
		}
	}
	return strings.TrimSuffix(path, ".rsc")
}

// nextGoPathEscape matches the WHATWG path percent-encode set as implemented
// by the Node.js versions Next.js supports, which leave `^` unencoded.
func nextGoPathEscape(c byte) bool {
	return c <= 0x20 || c >= 0x7f || strings.IndexByte("\"#<>?`{}", c) >= 0
}

func nextGoQueryEscape(c byte) bool {
	return c <= 0x20 || c >= 0x7f || strings.IndexByte("\"#<>'", c) >= 0
}

func nextGoPercentEncode(value string, escape func(byte) bool) string {
	var b strings.Builder
	for i := 0; i < len(value); i++ {
		if c := value[i]; escape(c) {
			b.WriteString("%" + strings.ToUpper(strconv.FormatInt(int64(c)>>4, 16)) + strings.ToUpper(strconv.FormatInt(int64(c)&15, 16)))
		} else {
			b.WriteByte(c)
		}
	}
	return b.String()
}

// nextGoParsePath parses an origin-form path like the WHATWG URL parser.
func nextGoParsePath(raw string) string {
	raw = strings.NewReplacer("\t", "", "\n", "", "\r", "").Replace(raw)
	var segments []string
	start := 1
	for i := 1; i <= len(raw); i++ {
		if i < len(raw) && raw[i] != '/' && raw[i] != '\\' {
			continue
		}
		atEnd := i == len(raw)
		segment := nextGoPercentEncode(raw[start:i], nextGoPathEscape)
		start = i + 1
		switch strings.ToLower(segment) {
		case "..", ".%2e", "%2e.", "%2e%2e":
			if len(segments) > 0 {
				segments = segments[:len(segments)-1]
			}
			if atEnd {
				segments = append(segments, "")
			}
		case ".", "%2e":
			if atEnd {
				segments = append(segments, "")
			}
		default:
			segments = append(segments, segment)
		}
	}
	return "/" + strings.Join(segments, "/")
}

// nextGoNormalizeQuery matches the adapter's URLSearchParams handling: it
// removes _rsc and serializes application/x-www-form-urlencoded in one pass.
// Client-supplied nxtP/nxtI names must not overwrite application parameters.
func nextGoNormalizeQuery(query string) string {
	var serialized strings.Builder
	for query != "" {
		var sequence string
		sequence, query, _ = strings.Cut(query, "&")
		if sequence == "" {
			continue
		}
		name, value, _ := strings.Cut(sequence, "=")
		name = nextGoFormDecode(name)
		if name == "_rsc" {
			continue
		}
		if serialized.Len() > 0 {
			serialized.WriteByte('&')
		}
		serialized.WriteString(nextGoFormEncode(name))
		serialized.WriteByte('=')
		serialized.WriteString(nextGoFormEncode(nextGoFormDecode(value)))
	}
	return serialized.String()
}

// nextGoFormDecode decodes an application/x-www-form-urlencoded value,
// replacing invalid UTF-8 like the WHATWG UTF-8 decoder.
func nextGoFormDecode(value string) string {
	value = strings.ReplaceAll(value, "+", " ")
	decoded := make([]byte, 0, len(value))
	for i := 0; i < len(value); i++ {
		if value[i] == '%' && i+2 < len(value) {
			if b, err := strconv.ParseUint(value[i+1:i+3], 16, 8); err == nil && value[i+1] != '+' && value[i+1] != '-' {
				decoded = append(decoded, byte(b))
				i += 2
				continue
			}
		}
		decoded = append(decoded, value[i])
	}
	var b strings.Builder
	needed, seen, lower, upper := 0, 0, byte(0x80), byte(0xbf)
	var codePoint rune
	for i := 0; i < len(decoded); i++ {
		c := decoded[i]
		if needed == 0 {
			switch {
			case c <= 0x7f:
				b.WriteByte(c)
			case 0xc2 <= c && c <= 0xdf:
				needed, codePoint = 1, rune(c&0x1f)
			case 0xe0 <= c && c <= 0xef:
				if c == 0xe0 {
					lower = 0xa0
				} else if c == 0xed {
					upper = 0x9f
				}
				needed, codePoint = 2, rune(c&0xf)
			case 0xf0 <= c && c <= 0xf4:
				if c == 0xf0 {
					lower = 0x90
				} else if c == 0xf4 {
					upper = 0x8f
				}
				needed, codePoint = 3, rune(c&0x7)
			default:
				b.WriteRune('\uFFFD')
			}
			continue
		}
		if c < lower || c > upper {
			needed, seen, codePoint, lower, upper = 0, 0, 0, 0x80, 0xbf
			b.WriteRune('\uFFFD')
			i--
			continue
		}
		lower, upper = 0x80, 0xbf
		codePoint = codePoint<<6 | rune(c&0x3f)
		if seen++; seen == needed {
			b.WriteRune(codePoint)
			needed, seen, codePoint = 0, 0, 0
		}
	}
	if needed != 0 {
		b.WriteRune('\uFFFD')
	}
	return b.String()
}

// nextGoFormEncode matches the application/x-www-form-urlencoded serializer.
func nextGoFormEncode(value string) string {
	value = nextGoPercentEncode(value, func(c byte) bool {
		return c != ' ' && c != '*' && c != '-' && c != '.' && c != '_' &&
			!('0' <= c && c <= '9' || 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z')
	})
	return strings.ReplaceAll(value, " ", "+")
}

// NextInternalGoHandler is called by the entrypoint that Next.js generates. It is
// not part of the proxy API.
func NextInternalGoHandler(trustInternalHeaders bool) http.HandlerFunc {
	return nextGoHandler(trustInternalHeaders)
}

func nextGoHandler(nextGoTrustInternalHeaders bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Bound normalization work before decoding or allocating query values.
		// Count separators directly, including empty parameters.
		if len(r.URL.RawQuery) > nextGoProxyMaxQueryBytes || strings.Count(r.URL.RawQuery, "&") >= nextGoProxyMaxQueryParams {
			http.Error(w, http.StatusText(http.StatusRequestURITooLong), http.StatusRequestURITooLong)
			return
		}
		// Adapter builds invoke Go directly, and Next.js forwards the URL from
		// before its proxy.ts normalization, so normalization happens exactly
		// once, here. It is not idempotent: applying it twice would change
		// paths such as /a.rsc.rsc.
		if !nextGoNormalizeURL(r) {
			http.NotFound(w, r)
			return
		}
		response := &nextGoProxyWriter{ResponseWriter: w, request: r}
		// Next.js resolves destinations against its own request origin, which
		// differs from the client's Host. Adapter builds resolve against r.Host,
		// the host the platform routed, and never read internal headers.
		if nextGoTrustInternalHeaders {
			response.rewriteHost = r.Header.Get("x-next-internal-go-rewrite-host")
		}
		r.Header.Del("x-next-internal-go-token")
		r.Header.Del("x-next-internal-go-rewrite-host")
		Proxy(response, r)
		if !response.wroteHeader {
			response.WriteHeader(http.StatusOK)
		}
	}
}
