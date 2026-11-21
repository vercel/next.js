package __NEXT_GO_PACKAGE__

import (
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

// NextInternalGoHandler is called by the entrypoint that Next.js generates. It is
// not part of the proxy API.
func NextInternalGoHandler(trustInternalHeaders bool) http.HandlerFunc {
	return nextGoHandler(trustInternalHeaders)
}

func nextGoHandler(nextGoTrustInternalHeaders bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Adapter builds invoke Go directly, bypassing the JavaScript adapter's
		// RSC URL normalization. Keep proxy authorization on the page identity.
		if strings.HasSuffix(r.URL.Path, ".rsc") {
			r.URL.Path = strings.TrimSuffix(r.URL.Path, ".rsc")
			r.URL.RawPath = strings.TrimSuffix(r.URL.RawPath, ".rsc")
			r.RequestURI = r.URL.RequestURI()
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
