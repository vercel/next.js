package main

import "net/http"

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-src-proxy", "yes")
	if r.URL.Path == "/native-proxy/rewrite" {
		headers := r.Header.Clone()
		headers.Set("x-from-go", "proxy")
		OverrideRequestHeaders(w, headers)
		Rewrite(w, "/native-proxy/native")
		return
	}
	Next(w)
}
