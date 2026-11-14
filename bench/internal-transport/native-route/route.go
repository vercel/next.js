package main

import "net/http"

func GET(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write([]byte(`{"hello":"next"}`))
}
