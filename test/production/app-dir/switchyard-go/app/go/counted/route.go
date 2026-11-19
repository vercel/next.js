package main

import (
	"net/http"
	"strconv"
	"sync/atomic"
)

var panics atomic.Int64

// GET answers how many times it has panicked; with ?mode=panic it panics
// before writing anything.
func GET(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery == "mode=panic" {
		panics.Add(1)
		panic("route.go fixture panics on purpose")
	}
	w.Write([]byte(strconv.FormatInt(panics.Load(), 10)))
}
