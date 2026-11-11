package main

import (
	"net/http"

	framework "github.com/vercel/next.js/packages/next/go"
)

var Config = framework.RouteConfig{
	MaxDuration:     17,
	PreferredRegion: []string{"sfo1", "iad1"},
}

func GET(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("configured route"))
}
