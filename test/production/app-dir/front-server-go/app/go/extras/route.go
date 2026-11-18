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
	typ := map[string]string{
		"json":       "application/json",
		"text":       "text/plain",
		"svg":        "image/svg+xml",
		"customjson": "application/x-front-server-go+json",
		"png":        "image/png",
		"unknown":    "application/x-front-server-go",
	}[r.URL.Query().Get("type")]
	if typ == "" {
		typ = "application/json"
	}
	w.Header().Set("Content-Type", typ)
	if control := r.URL.Query().Get("cacheControl"); control != "" {
		w.Header().Set("Cache-Control", control)
	}
	if vary := r.URL.Query().Get("vary"); vary != "" {
		if vary == "wildcard" {
			vary = "*"
		}
		w.Header().Set("Vary", vary)
	}
	if r.URL.Query().Has("largeHeader") {
		w.Header().Set("X-Large", strings.Repeat("x", 20*1024))
	}
	w.Header().Set("Trailer", "X-Checksum")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"padding":"` + strings.Repeat("x", 2048) + `"}`))
	w.Header().Set("X-Checksum", "abc")
}
