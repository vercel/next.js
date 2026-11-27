package proxy

import (
	"net/http"
	"next/go/proxy"
	"strings"
)

func Proxy(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/docs")
	w.Header().Set("x-authorized-path", path)
	if path == "/native-security/private" ||
		path == "/native-security/go/private" || strings.HasPrefix(path, "/native-security/go/private/") ||
		(strings.HasPrefix(path, "/native-security/resource/") || strings.HasPrefix(path, "/native-security/single/") || strings.HasPrefix(path, "/native-security/edge/")) && (strings.HasSuffix(path, "/private") || strings.HasSuffix(path, "/literal.rsc")) {
		http.Error(w, "protected", http.StatusForbidden)
		return
	}
	if path == "/native-security/query" {
		resource := r.URL.Query().Get("resource")
		if resource != "public" {
			http.Error(w, "protected query", http.StatusForbidden)
			return
		}
		w.Header().Set("x-authorized-resource", resource)
	}
	proxy.Next(w)
}
