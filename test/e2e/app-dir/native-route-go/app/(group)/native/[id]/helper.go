package main

import "net/http"

func sibling() string { return "sibling-v1" }

func POST(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Handled-By", "POST")
	serveNative(w, r)
}
