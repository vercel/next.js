package main

import (
	"net/http"
	"net/url"
	"sort"
	"strconv"
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

// nextGoEmptyOverride stands in for an empty override list, which Next.js
// otherwise ignores. Listing a header that the request never carries removes
// every other request header without changing JavaScript proxy semantics.
const nextGoEmptyOverride = "x-next-internal-go-empty-override"

// Next continues routing only when the proxy explicitly returns this header.
// All other responses are terminal, including empty responses.
func Next(w http.ResponseWriter, options ...ProxyOptions) {
	nextGoProxyOptions(w, options)
	w.Header().Set("x-middleware-next", "1")
}

func Rewrite(w http.ResponseWriter, destination string, options ...ProxyOptions) {
	nextGoProxyOptions(w, options)
	w.Header().Set("x-middleware-rewrite", destination)
}

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

func nextGoProxyOptions(w http.ResponseWriter, options []ProxyOptions) {
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
		names = append(names, nextGoEmptyOverride)
	}
	w.Header().Set("x-middleware-override-headers", strings.Join(names, ","))
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
// adapter passes to proxy.ts as request.url. Transport suffixes apply only to
// the pathname, before percent decoding. Client query names are never routing
// metadata. Pages data URLs are rejected because proxy.go only supports App
// Router applications, whose catch-all handlers can otherwise reinterpret them.
func nextGoNormalizeURL(r *http.Request) bool {
	target := r.RequestURI
	if !strings.HasPrefix(target, "/") {
		target = r.URL.EscapedPath()
		if r.URL.ForceQuery || r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
	}
	target, _, _ = strings.Cut(target, "#")
	rawPath, rawQuery, hasQuery := strings.Cut(target, "?")
	path := nextGoParsePath(rawPath)
	// Assigning URL.pathname reparses dot segments, including ones exposed by
	// removing a transport suffix, such as /a/...rsc becoming /a/.. and then /.
	path = nextGoParsePath(nextGoNormalizeRSCPath(path))
	if nextGoIsDataPath(path) {
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

func nextGoHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Bound normalization work before decoding or allocating query values.
		// Count separators directly, including empty parameters.
		if len(r.URL.RawQuery) > nextGoProxyMaxQueryBytes || strings.Count(r.URL.RawQuery, "&") >= nextGoProxyMaxQueryParams {
			http.Error(w, http.StatusText(http.StatusRequestURITooLong), http.StatusRequestURITooLong)
			return
		}
		// Adapter builds invoke Go directly, bypassing the JavaScript adapter.
		// Apply its URL normalization so Proxy sees the same URL as proxy.ts.
		// Next.js has already applied it to requests it forwards, and it is not
		// idempotent: applying it twice would change paths such as /a.rsc.rsc.
		if nextGoTrustInternalHeaders {
			if nextGoIsDataPath(r.URL.EscapedPath()) {
				http.NotFound(w, r)
				return
			}
		} else {
			if !nextGoNormalizeURL(r) {
				http.NotFound(w, r)
				return
			}
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
