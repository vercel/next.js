package PACKAGE

import (
	"context"
	"net/http"
	"strings"
)

type nextGoParamsKey struct{}

func ParamValues(r *http.Request, name string) []string {
	params, _ := r.Context().Value(nextGoParamsKey{}).(map[string][]string)
	return params[name]
}
func NextGoServe(w http.ResponseWriter, r *http.Request, params map[string][]string) {
	supported := r.Method == "HEAD"
	hasGet := false
	for _, method := range Methods {
		if method == r.Method {
			supported = true
		}
		if method == "GET" {
			hasGet = true
		}
	}
	if r.Method == "HEAD" {
		supported = supported && hasGet || containsMethod("HEAD")
	}
	if r.Method == "OPTIONS" {
		allow := []string{}
		for _, method := range []string{"GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"} {
			if containsMethod(method) || method == "HEAD" && hasGet || method == "OPTIONS" {
				allow = append(allow, method)
			}
		}
		w.Header().Set("Allow", strings.Join(allow, ", "))
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !supported {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	for name, values := range params {
		r.SetPathValue(name, strings.Join(values, "/"))
	}
	Handle(w, r.WithContext(context.WithValue(r.Context(), nextGoParamsKey{}, params)))
}
func containsMethod(method string) bool {
	for _, value := range Methods {
		if value == method {
			return true
		}
	}
	return false
}
