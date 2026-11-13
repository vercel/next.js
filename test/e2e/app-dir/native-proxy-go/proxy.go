package main

import (
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
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
		Rewrite(w, destination)
		return
	}
	switch r.URL.Path {
	case "/native-proxy/blocked":
		http.Error(w, "blocked by Go", http.StatusForbidden)
	case "/native-proxy/compressed":
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Encoding", "gzip")
		compressed := gzip.NewWriter(w)
		fmt.Fprint(compressed, "compressed by Go")
		compressed.Close()
	case "/native-proxy/rewrite":
		Rewrite(w, "/api/proxy-query?rewritten=1")
	case "/native-proxy/host-gate":
		if r.Host != "admin.example.test" {
			http.Error(w, "invalid host", http.StatusForbidden)
			return
		}
		Rewrite(w, "./inspect")
	case "/native-proxy/redirect":
		http.Redirect(w, r, "/native-proxy/inspect", http.StatusTemporaryRedirect)
	case "/native-proxy/override":
		headers := r.Header.Clone()
		headers.Set("x-from-go", "overridden")
		headers.Del("x-client-remove")
		OverrideRequestHeaders(w, headers)
		Rewrite(w, "/native-proxy/inspect")
	case "/native-proxy/external-override":
		headers := r.Header.Clone()
		headers.Set("x-from-go", "overridden")
		OverrideRequestHeaders(w, headers)
		Rewrite(w, "http://127.0.0.1:"+r.URL.Query().Get("port")+"/public")
	case "/native-proxy/cookies":
		http.SetCookie(w, &http.Cookie{Name: "first", Value: "one", Path: "/"})
		http.SetCookie(w, &http.Cookie{Name: "second", Value: "two", Path: "/"})
		Rewrite(w, "/native-proxy/inspect")
	case "/native-proxy/body":
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("x-go-body", string(body))
		Rewrite(w, "/native-proxy/inspect")
	case "/native-proxy/stream":
		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, "first\n")
		w.(http.Flusher).Flush()
		fmt.Fprint(w, strings.Repeat("go", 1000))
	default:
		Next(w)
	}
}
