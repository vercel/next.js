package main

import "net/http"

// GET sets hop-by-hop headers, and a header its Connection header names,
// which a proxy may pass on or drop.
func GET(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Keep-Alive", "timeout=7")
	w.Header().Set("Proxy-Authenticate", `Basic realm="switchyard"`)
	w.Header().Set("Proxy-Authorization", "Basic c3dpdGNoeWFyZA==")
	w.Header().Set("Proxy-Connection", "keep-alive")
	w.Header().Set("Te", "trailers")
	w.Header().Set("Upgrade", "h2c")
	w.Header().Set("Connection", "X-Hop")
	w.Header().Set("X-Hop", "listed")
	w.Write([]byte("hop"))
}
