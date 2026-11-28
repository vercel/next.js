package proxy

import (
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"next/go/proxy"
	"strconv"
	"strings"
	"time"
)

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-go-proxy", "yes")
	w.Header().Set("x-go-url", r.RequestURI)
	w.Header().Set("x-go-host", r.Host)
	w.Header().Set("x-private-token", strconv.FormatBool(r.Header.Get("x-next-internal-go-token") != "" || r.Header.Get("x-next-internal-go-rewrite-host") != "" || r.Header.Get("x-next-internal-test") != ""))
	if date := r.URL.Query().Get("response-date"); date != "" {
		w.Header().Set("Date", date)
	}
	if destination := r.URL.Query().Get("relative-location"); destination != "" {
		w.Header().Set("Location", destination)
		w.WriteHeader(http.StatusTemporaryRedirect)
		return
	}
	if destination := r.URL.Query().Get("relative-rewrite"); destination != "" {
		proxy.Rewrite(w, destination)
		return
	}
	switch r.URL.Path {
	case "/native-proxy/options":
		var headers http.Header
		switch r.URL.Query().Get("headers") {
		case "replace":
			headers = http.Header{"X-From-Go": {"options"}}
		case "empty":
			headers = http.Header{}
		}
		options := []proxy.Option{proxy.WithRequestHeaders(headers)}
		if r.URL.Query().Get("headers") == "multiple" {
			options = []proxy.Option{
				proxy.WithRequestHeaders(http.Header{"X-From-Go": {"first"}}),
				proxy.WithRequestHeaders(http.Header{"X-From-Go": {"last"}}),
			}
		}
		if r.URL.Query().Get("rewrite") == "1" {
			proxy.Rewrite(w, "/native-proxy/inspect", options...)
		} else {
			proxy.Next(w, options...)
		}
	case "/native-proxy/blocked":
		http.Error(w, "blocked by Go", http.StatusForbidden)
	case "/native-proxy/secure", "/native-proxy/pages-secure":
		http.Error(w, "protected", http.StatusForbidden)
	case "/native-proxy/compressed":
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Encoding", "gzip")
		compressed := gzip.NewWriter(w)
		fmt.Fprint(compressed, "compressed by Go")
		compressed.Close()
	case "/native-proxy/rewrite":
		proxy.Rewrite(w, "/api/proxy-query?rewritten=1")
	case "/native-proxy/host-gate":
		if r.Host != "admin.example.test" {
			http.Error(w, "invalid host", http.StatusForbidden)
			return
		}
		proxy.Rewrite(w, "./inspect")
	case "/native-proxy/redirect":
		http.Redirect(w, r, "/native-proxy/inspect", http.StatusTemporaryRedirect)
	case "/native-proxy/override":
		headers := r.Header.Clone()
		headers.Set("x-from-go", "overridden")
		headers.Del("x-client-remove")
		proxy.Rewrite(w, "/native-proxy/inspect", proxy.WithRequestHeaders(headers))
	case "/native-proxy/cookies":
		http.SetCookie(w, &http.Cookie{Name: "first", Value: "one", Path: "/"})
		http.SetCookie(w, &http.Cookie{Name: "second", Value: "two", Path: "/"})
		proxy.Rewrite(w, "/native-proxy/inspect")
	case "/native-proxy/cookie-state", "/native-proxy/cookie-rewrite":
		var options []proxy.Option
		if r.URL.Query().Get("override") == "1" {
			headers := r.Header.Clone()
			headers.Set("Host", r.Host)
			options = append(options, proxy.WithRequestHeaders(headers))
		}
		if r.URL.Path == "/native-proxy/cookie-rewrite" {
			proxy.Rewrite(w, "/native-proxy/cookie-state", options...)
		} else {
			proxy.Next(w, options...)
		}
		// Cookies may be set after selecting Next or Rewrite, until headers commit.
		http.SetCookie(w, &http.Cookie{Name: "first", Value: "fresh", Path: "/", HttpOnly: true})
		http.SetCookie(w, &http.Cookie{Name: "second", Value: "new", Path: "/"})
		http.SetCookie(w, &http.Cookie{Name: "expiring", Value: "value", Path: "/", Expires: time.Date(2035, time.January, 2, 3, 4, 5, 0, time.UTC)})
	case "/native-proxy/body":
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("x-go-body", string(body))
		proxy.Rewrite(w, "/native-proxy/inspect")
	case "/native-proxy/stream":
		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, "first\n")
		w.(http.Flusher).Flush()
		fmt.Fprint(w, strings.Repeat("go", 1000))
	default:
		proxy.Next(w)
	}
}
