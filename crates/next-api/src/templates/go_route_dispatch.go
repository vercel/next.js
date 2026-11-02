package main

import (
	"net/http"
	"sort"
	"strings"
)

// The Go compiler validates every declared route method against net/http's signature.
var nextGoDeclaredMethods = map[string]http.HandlerFunc{
	// __NEXT_GO_ROUTE_METHODS__
}

func nextGoRouteHandler() http.HandlerFunc {
	methods := make(map[string]http.HandlerFunc, len(nextGoDeclaredMethods)+2)
	for method, handler := range nextGoDeclaredMethods {
		methods[method] = handler
	}
	if methods["HEAD"] == nil && methods["GET"] != nil {
		methods["HEAD"] = methods["GET"]
	}
	if methods["OPTIONS"] == nil {
		allow := make([]string, 0, len(methods)+1)
		for method := range methods {
			allow = append(allow, method)
		}
		allow = append(allow, "OPTIONS")
		sort.Strings(allow)
		header := strings.Join(allow, ", ")
		methods["OPTIONS"] = func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Allow", header)
			w.WriteHeader(http.StatusNoContent)
		}
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if handler := methods[r.Method]; handler != nil {
			handler(w, r)
		} else {
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}
}
