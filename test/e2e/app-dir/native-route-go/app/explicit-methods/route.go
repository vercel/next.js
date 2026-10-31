package main

import "net/http"

func GET(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Handled-By", "GET")
	w.Write([]byte("GET"))
}

func HEAD(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Handled-By", "HEAD")
	w.WriteHeader(http.StatusAccepted)
	w.Write([]byte("explicit HEAD body"))
}

func OPTIONS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Handled-By", "OPTIONS")
	w.Header().Set("Allow", "OPTIONS")
	w.WriteHeader(http.StatusAccepted)
	w.Write([]byte("explicit OPTIONS"))
}
