package main

import "net/http"

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-src-proxy", "yes")
	if r.URL.Path == "/native-proxy/rewrite" || r.URL.Query().Get("override") == "1" {
		headers := r.Header.Clone()
		headers.Set("Host", r.Host)
		headers.Set("x-from-go", "proxy")
		OverrideRequestHeaders(w, headers)
		if r.URL.Path == "/native-proxy/rewrite" {
			Rewrite(w, "/native-proxy/native")
		} else {
			Next(w)
		}
		return
	}
	Next(w)
}
