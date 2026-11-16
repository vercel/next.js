package main

import (
	"net/http"
	"next/go"
)

var Config = next.ProxyConfig{
	Matcher: []next.Matcher{
		{Source: "/configured"},
		{Source: "/conditional", Has: []next.RouteHas{{Type: "header", Key: "x-config-match", Value: "yes"}}},
		{Source: "/missing", Missing: []next.RouteHas{{Type: "cookie", Key: "skip"}}},
	},
}

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-static-go-config", "matched")
	Next(w)
}
