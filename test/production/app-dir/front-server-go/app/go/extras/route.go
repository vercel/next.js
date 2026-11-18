package main

import (
	"net/http"
	"strings"
)

// GET sends things a proxy may pass on or drop: an early-hints response,
// repeated Set-Cookie headers, a trailer, and a compressible JSON body larger
// than 1 KiB.
func GET(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Link", "</style.css>; rel=preload; as=style")
	w.WriteHeader(http.StatusEarlyHints)
	w.Header().Add("Set-Cookie", "first=1; Path=/")
	w.Header().Add("Set-Cookie", "second=2; Path=/")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Trailer", "X-Checksum")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"padding":"` + strings.Repeat("x", 2048) + `"}`))
	w.Header().Set("X-Checksum", "abc")
}
