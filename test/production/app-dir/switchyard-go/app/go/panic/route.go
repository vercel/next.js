package main

import "net/http"

// GET fails before writing anything.
func GET(w http.ResponseWriter, r *http.Request) {
	panic("route.go fixture panics on purpose")
}
