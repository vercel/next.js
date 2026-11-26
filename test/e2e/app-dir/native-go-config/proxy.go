package proxy

import (
	"net/http"
	"next/go/proxy"
)

var Config = proxy.Config{
	Matcher: []proxy.Matcher{
		{Source: "/configured"},
		{Source: "/conditional", Has: []proxy.Condition{{Type: "header", Key: "x-config-match", Value: "yes"}}},
		{Source: "/missing", Missing: []proxy.Condition{{Type: "cookie", Key: "skip"}}},
	},
}

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-static-go-config", "matched")
	proxy.Next(w)
}
