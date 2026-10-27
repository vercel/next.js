package main

import (
	"encoding/json"
	"net/http"
)

var Methods = []string{"GET"}

func Handle(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]any{
		"params": ParamValues(r, "slug"), "value": r.PathValue("slug"),
		"path": r.URL.EscapedPath(), "requestURI": r.RequestURI,
		"query":         r.URL.RawQuery,
		"routingHeader": r.Header.Get("X-Test-Go-Routing-Path"),
	})
}
