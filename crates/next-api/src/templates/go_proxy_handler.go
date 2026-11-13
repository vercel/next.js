package main

import (
	"net/http"
	"net/url"
	"strings"
)

// Next continues routing only when the proxy explicitly returns this header.
// All other responses are terminal, including empty responses.
func Next(w http.ResponseWriter) {
	w.Header().Set("x-middleware-next", "1")
}

func Rewrite(w http.ResponseWriter, destination string) {
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
			if _, explicit := w.Header()["Date"]; !explicit {
				w.Header()["Date"] = nil
			}
		}
		// Go permits relative redirects and rewrites. The Next adapter consumes
		// absolute URLs, and the platform can then make same-origin URLs relative.
		// Preserve RawPath, RawQuery and ForceQuery when resolving references.
		base := *w.request.URL
		base.Scheme = w.request.Header.Get("X-Forwarded-Proto")
		base.Host = w.rewriteHost
		if base.Host == "" {
			base.Host = w.request.Host
		}
		if base.Scheme == "" {
			base.Scheme = "http"
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

// OverrideRequestHeaders replaces the downstream request headers, matching
// NextResponse.next({ request: { headers } }). A missing header is deleted.
func OverrideRequestHeaders(w http.ResponseWriter, headers http.Header) {
	names := make([]string, 0, len(headers))
	for name, values := range headers {
		name = strings.ToLower(name)
		names = append(names, name)
		w.Header()["x-middleware-request-"+name] = values
	}
	w.Header().Set("x-middleware-override-headers", strings.Join(names, ","))
}

func nextGoHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response := &nextGoProxyWriter{
			ResponseWriter: w,
			request:        r,
			rewriteHost:    r.Header.Get("x-next-internal-go-rewrite-host"),
		}
		r.Header.Del("x-next-internal-go-token")
		r.Header.Del("x-next-internal-go-rewrite-host")
		Proxy(response, r)
		if !response.wroteHeader {
			response.WriteHeader(http.StatusOK)
		}
	}
}
