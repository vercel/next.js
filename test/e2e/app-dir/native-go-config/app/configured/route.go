package main

import "net/http"

const MaxDuration = 17

func GET(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("configured route"))
}
