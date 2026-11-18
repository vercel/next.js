package main

import (
	"net"
	"net/http"
	"net/url"
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

// Routing configuration, replaced when the proxy is compiled.
const nextGoBasePath = "__NEXT_GO_BASE_PATH__"
const nextGoDefaultLocale = "__NEXT_GO_DEFAULT_LOCALE__"
const nextGoSkipProxyURLNormalize = false

// nextGoLocales lists the i18n locales in their configured casing.
var nextGoLocales = []string{
	// __NEXT_GO_LOCALES__
}

// nextGoDomainLocales maps i18n domain hostnames to their default locale.
var nextGoDomainLocales = map[string]string{
	// __NEXT_GO_DOMAIN_LOCALES__
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

// nextGoUnreserved reports whether c is an RFC 3986 unreserved character.
func nextGoUnreserved(c byte) bool {
	return 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9' ||
		c == '-' || c == '.' || c == '_' || c == '~'
}

func nextGoUnhex(c byte) (byte, bool) {
	switch {
	case '0' <= c && c <= '9':
		return c - '0', true
	case 'a' <= c && c <= 'f':
		return c - 'a' + 10, true
	case 'A' <= c && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}

// nextGoDecodeUnreserved decodes percent-encoded unreserved characters, which
// are equivalent to their literal form (RFC 3986, section 6.2.2.2). Other
// escapes, such as encoded separators, keep their meaning and are preserved.
func nextGoDecodeUnreserved(escaped string) string {
	if !strings.Contains(escaped, "%") {
		return escaped
	}
	var b strings.Builder
	b.Grow(len(escaped))
	for i := 0; i < len(escaped); i++ {
		if escaped[i] == '%' && i+2 < len(escaped) {
			hi, ok1 := nextGoUnhex(escaped[i+1])
			lo, ok2 := nextGoUnhex(escaped[i+2])
			if c := hi<<4 | lo; ok1 && ok2 && nextGoUnreserved(c) {
				b.WriteByte(c)
				i += 2
				continue
			}
		}
		b.WriteByte(escaped[i])
	}
	return b.String()
}

// nextGoHostDefaultLocale returns the default locale for a request host,
// preferring a matching i18n domain over the global default locale.
func nextGoHostDefaultLocale(host string) string {
	if len(nextGoDomainLocales) > 0 {
		hostname := host
		if h, _, err := net.SplitHostPort(host); err == nil {
			hostname = h
		}
		if locale, ok := nextGoDomainLocales[strings.ToLower(hostname)]; ok {
			return locale
		}
	}
	return nextGoDefaultLocale
}

// nextGoHasPathPrefix matches a whole path prefix, like pathHasPrefix.
func nextGoHasPathPrefix(path string, prefix string) bool {
	return path == prefix || strings.HasPrefix(path, prefix+"/")
}

func nextGoRemoveTrailingSlash(path string) string {
	if len(path) > 1 && strings.HasSuffix(path, "/") {
		return path[:len(path)-1]
	}
	return path
}

// nextGoPagePath returns the escaped page URL path that an escaped request
// path addresses, matching the URL that the JavaScript adapter passes to
// proxies: RSC payloads, segment prefetches and Pages data requests are
// alternative transports for a page and resolve to it downstream, and the
// default locale is omitted. Proxy must authorize them as the page itself.
func nextGoPagePath(escaped string, host string) string {
	path := nextGoDecodeUnreserved(escaped)
	path = strings.TrimSuffix(path, ".rsc")
	if nextGoSkipProxyURLNormalize {
		return path
	}

	// Segment prefetches: <page>.segments/<segment path>.segment(.rsc)
	if i := strings.LastIndex(path, ".segments/"); i > 0 && strings.HasSuffix(path, ".segment") {
		path = path[:i]
	}

	trailingSlash := path != "/" && strings.HasSuffix(path, "/")
	pathname, hasBasePath := path, false
	if nextGoBasePath != "" && nextGoHasPathPrefix(path, nextGoBasePath) {
		pathname, hasBasePath = path[len(nextGoBasePath):], true
		if pathname == "" {
			pathname = "/"
		}
	}

	// Pages data requests: <basePath>/_next/data/<buildId>/<page>.json
	isData := strings.HasPrefix(pathname, "/_next/data/")
	if isData {
		trailingSlash = false
		// Any build ID resolves downstream, so do not require the current one.
		pathname = strings.TrimPrefix(pathname, "/_next/data/")
		if i := strings.IndexByte(pathname, '/'); i >= 0 {
			pathname = pathname[i:]
		} else {
			pathname = ""
		}
		pathname = strings.TrimSuffix(pathname, ".json")
		// Invert normalizePagePath: / is emitted as /index and pages under
		// /index as /index/index. Other paths, including /index/<dynamic
		// segment>, are emitted unchanged.
		if pathname == "" || pathname == "/" || pathname == "/index" {
			pathname = "/"
		} else if strings.HasPrefix(pathname, "/index/index") {
			if rest := pathname[len("/index"):]; rest == "/index" || strings.HasPrefix(rest, "/index/") {
				pathname = rest
			}
		}
	} else if len(nextGoLocales) == 0 || nextGoURLNormalizedByNext {
		// Next.js has already applied basePath and locale normalization to
		// page URLs; applying it twice is not idempotent for every path.
		return path
	}

	// Locales, like NextURL: detect the locale prefix, then add it back only
	// when it differs from the default locale for the host.
	if len(nextGoLocales) > 0 {
		locale := ""
		first, rest, _ := strings.Cut(pathname[1:], "/")
		for _, candidate := range nextGoLocales {
			if first != "" && strings.EqualFold(first, candidate) {
				locale = candidate
				pathname = "/" + rest
				break
			}
		}
		defaultLocale := nextGoHostDefaultLocale(host)
		if locale == "" {
			locale = defaultLocale
		}
		if locale != "" && locale != defaultLocale {
			lower := strings.ToLower(pathname)
			if !nextGoHasPathPrefix(lower, "/api") && !nextGoHasPathPrefix(lower, "/"+strings.ToLower(locale)) {
				pathname = "/" + locale + pathname
			}
		}
	}

	if !trailingSlash {
		pathname = nextGoRemoveTrailingSlash(pathname)
	}
	if hasBasePath {
		pathname = nextGoBasePath + pathname
	}
	if trailingSlash {
		if !strings.HasSuffix(pathname, "/") {
			pathname += "/"
		}
		return pathname
	}
	return nextGoRemoveTrailingSlash(pathname)
}

// nextGoNormalizeRequestURL rewrites the request URL to the page it addresses.
func nextGoNormalizeRequestURL(r *http.Request) {
	escaped := r.URL.EscapedPath()
	page := nextGoPagePath(escaped, r.Host)
	if page == nextGoDecodeUnreserved(escaped) {
		return
	}
	path, err := url.PathUnescape(page)
	if err != nil {
		return
	}
	r.URL.Path = path
	r.URL.RawPath = page
	r.RequestURI = r.URL.RequestURI()
}

func nextGoHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Adapter builds invoke Go directly with the original request URL,
		// bypassing the JavaScript adapter's URL normalization. Keep proxy
		// authorization on the page identity that the request resolves to.
		nextGoNormalizeRequestURL(r)
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
