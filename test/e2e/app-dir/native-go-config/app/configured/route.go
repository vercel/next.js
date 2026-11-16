package main

import "net/http"

const MaxDuration = 17

var PreferredRegion = []string{"sfo1", "iad1"}

func GET(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("configured route"))
}
