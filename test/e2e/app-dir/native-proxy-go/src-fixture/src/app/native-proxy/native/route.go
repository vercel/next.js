package main

import (
	"fmt"
	"net/http"
)

func GET(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "native handler: %s", r.Header.Get("x-from-go"))
}
