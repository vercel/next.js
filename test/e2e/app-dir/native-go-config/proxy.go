package main

import (
	next "github.com/vercel/next.js/packages/next/go"
	"net/http"
)

var Config = next.ProxyConfig{
	Matcher: []next.Matcher{
		{Source: "/configured"},
		{Source: "/conditional", Has: []next.RouteHas{{Type: "header", Key: "x-config-match", Value: "yes"}}},
		{Source: "/missing", Missing: []next.RouteHas{{Type: "cookie", Key: "skip"}}},
	},
	MaxDuration:     11,
	PreferredRegion: []string{"iad1"},
}

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-static-go-config", "matched")
	Next(w)
}
