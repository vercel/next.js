package main

import (
	"net/http"
	"strconv"
)

// GET answers with the status code named in the path, so tests can read the
// reason phrase the client gets.
func GET(w http.ResponseWriter, r *http.Request) {
	code, err := strconv.Atoi(r.PathValue("code"))
	if err != nil {
		code = http.StatusBadRequest
	}
	w.WriteHeader(code)
	w.Write([]byte("status"))
}
