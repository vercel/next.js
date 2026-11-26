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
		{Source: "/headers/has", Has: []proxy.Condition{{Type: "header", Key: "x-resource", Value: "private"}}},
		{Source: "/headers/has", Has: []proxy.Condition{{Type: "header", Key: "set-cookie", Value: "private"}}},
		{Source: "/headers/missing", Missing: []proxy.Condition{{Type: "header", Key: "x-resource"}}},
	},
}

func Proxy(w http.ResponseWriter, r *http.Request) {
	resource := r.Header.Get("X-Resource")
	if resource == "" && r.URL.Path == "/headers/has" {
		resource = r.Header.Get("Set-Cookie")
	}
	if (r.URL.Path == "/headers/has" && resource == "private") ||
		(r.URL.Path == "/headers/missing" && resource == "") {
		http.Error(w, "protected", http.StatusForbidden)
		return
	}
	w.Header().Set("x-static-go-config", "matched")
	proxy.Next(w)
}
