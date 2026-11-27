package proxy

import "net/http"

func Proxy(w http.ResponseWriter, r *http.Request) {
	proxyHandler(w, r)
}
