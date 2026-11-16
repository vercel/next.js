package main

import (
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"next/go"
	"strconv"
	"strings"
	"time"
)

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-go-proxy", "yes")
	w.Header().Set("x-go-url", r.URL.RequestURI())
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
		next.Rewrite(w, destination)
		return
	}
	switch r.URL.Path {
	case "/native-proxy/options":
		options := next.ProxyOptions{}
		switch r.URL.Query().Get("headers") {
		case "replace":
			options.Request.Headers = http.Header{"X-From-Go": {"options"}}
		case "empty":
			options.Request.Headers = http.Header{}
		}
		if r.URL.Query().Get("rewrite") == "1" {
			next.Rewrite(w, "/native-proxy/inspect", options)
		} else {
			next.Next(w, options)
		}
	case "/native-proxy/invalid-next-options":
		next.Next(w, next.ProxyOptions{}, next.ProxyOptions{})
	case "/native-proxy/invalid-rewrite-options":
		next.Rewrite(w, "/native-proxy/inspect", next.ProxyOptions{}, next.ProxyOptions{})
	case "/native-proxy/blocked":
		http.Error(w, "blocked by Go", http.StatusForbidden)
	case "/native-proxy/secure":
		http.Error(w, "protected", http.StatusForbidden)
	case "/native-proxy/compressed":
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Encoding", "gzip")
		compressed := gzip.NewWriter(w)
		fmt.Fprint(compressed, "compressed by Go")
		compressed.Close()
	case "/native-proxy/rewrite":
		next.Rewrite(w, "/api/proxy-query?rewritten=1")
	case "/native-proxy/host-gate":
		if r.Host != "admin.example.test" {
			http.Error(w, "invalid host", http.StatusForbidden)
			return
		}
		next.Rewrite(w, "./inspect")
	case "/native-proxy/redirect":
		http.Redirect(w, r, "/native-proxy/inspect", http.StatusTemporaryRedirect)
	case "/native-proxy/override":
		headers := r.Header.Clone()
		headers.Set("x-from-go", "overridden")
		headers.Del("x-client-remove")
		next.Rewrite(w, "/native-proxy/inspect", next.ProxyOptions{
			Request: next.RequestOptions{Headers: headers},
		})
	case "/native-proxy/cookies":
		http.SetCookie(w, &http.Cookie{Name: "first", Value: "one", Path: "/"})
		http.SetCookie(w, &http.Cookie{Name: "second", Value: "two", Path: "/"})
		next.Rewrite(w, "/native-proxy/inspect")
	case "/native-proxy/cookie-state", "/native-proxy/cookie-rewrite":
		options := next.ProxyOptions{}
		if r.URL.Query().Get("override") == "1" {
			headers := r.Header.Clone()
			headers.Set("Host", r.Host)
			options.Request.Headers = headers
		}
		if r.URL.Path == "/native-proxy/cookie-rewrite" {
			next.Rewrite(w, "/native-proxy/cookie-state", options)
		} else {
			next.Next(w, options)
		}
		// Cookies may be set after selecting Next or Rewrite, until headers commit.
		http.SetCookie(w, &http.Cookie{Name: "first", Value: "fresh", Path: "/", HttpOnly: true})
		http.SetCookie(w, &http.Cookie{Name: "second", Value: "new", Path: "/"})
		http.SetCookie(w, &http.Cookie{Name: "expiring", Value: "value", Path: "/", Expires: time.Date(2035, time.January, 2, 3, 4, 5, 0, time.UTC)})
	case "/native-proxy/body":
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("x-go-body", string(body))
		next.Rewrite(w, "/native-proxy/inspect")
	case "/native-proxy/stream":
		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, "first\n")
		w.(http.Flusher).Flush()
		fmt.Fprint(w, strings.Repeat("go", 1000))
	default:
		next.Next(w)
	}
}
