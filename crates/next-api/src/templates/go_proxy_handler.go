package main

import (
	"net/http"
	"net/url"
	"strings"
)

// Proxy calls next.Next and next.Rewrite from the next/go SDK, which only set
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

func nextGoHandler() http.HandlerFunc {
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
