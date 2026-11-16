package main

import (
	"net/http"
	"next/go"
)

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-src-proxy", "yes")
	if r.URL.Path == "/native-proxy/rewrite" || r.URL.Query().Get("override") == "1" {
		headers := r.Header.Clone()
		headers.Set("Host", r.Host)
		headers.Set("x-from-go", "proxy")
		if r.URL.Path == "/native-proxy/rewrite" {
			next.Rewrite(w, "/native-proxy/native", next.ProxyOptions{Request: next.RequestOptions{Headers: headers}})
		} else {
			next.Next(w, next.ProxyOptions{Request: next.RequestOptions{Headers: headers}})
		}
		return
	}
	next.Next(w)
}
