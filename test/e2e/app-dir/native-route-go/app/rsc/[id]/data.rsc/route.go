package main

import "net/http"

func GET(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte(r.URL.EscapedPath()))
}
