package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"unicode/utf8"
)

// Each executable contains only its own route pattern, not the application route table.
const nextGoRoutePattern = "__NEXT_GO_ROUTE_PATTERN__"

type nextGoParamsKey struct{}

// ParamValues returns decoded route parameters, including individual catch-all segments.
func ParamValues(r *http.Request, name string) []string {
	params, _ := r.Context().Value(nextGoParamsKey{}).(map[string][]string)
	return params[name]
}

func nextGoPathSegments(path string) []string {
	path = strings.TrimSuffix(strings.TrimPrefix(path, "/"), "/")
	if path == "" {
		return nil
	}
	return strings.Split(path, "/")
}

var nextGoRouteSegments = nextGoPathSegments(nextGoRoutePattern)

func nextGoMatchParams(path string) (map[string][]string, bool, error) {
	encoded := nextGoPathSegments(path)
	segments := make([]string, len(encoded))
	for i, segment := range encoded {
		if segment == "" {
			return nil, false, nil
		}
		decoded, err := url.PathUnescape(segment)
		if err != nil || !utf8.ValidString(decoded) {
			return nil, false, fmt.Errorf("invalid route parameters")
		}
		segments[i] = decoded
	}
	params := map[string][]string{}
	index := 0
	for _, segment := range nextGoRouteSegments {
		if strings.HasPrefix(segment, "[[...") && strings.HasSuffix(segment, "]]") {
			if index < len(segments) {
				params[segment[5:len(segment)-2]] = segments[index:]
			}
			index = len(segments)
			break
		}
		if strings.HasPrefix(segment, "[...") && strings.HasSuffix(segment, "]") {
			if index == len(segments) {
				return nil, false, nil
			}
			params[segment[4:len(segment)-1]] = segments[index:]
			index = len(segments)
			break
		}
		if index == len(segments) {
			return nil, false, nil
		}
		if strings.HasPrefix(segment, "[") && strings.HasSuffix(segment, "]") {
			params[segment[1:len(segment)-1]] = []string{segments[index]}
		} else if segment != segments[index] {
			return nil, false, nil
		}
		index++
	}
	if index != len(segments) {
		return nil, false, nil
	}
	// Match Next's parameter normalization, without changing the request URL.
	for _, values := range params {
		for i, value := range values {
			values[i] = strings.TrimPrefix(value, "_NEXTSEP_")
		}
	}
	return params, true, nil
}

func nextGoHandler() http.HandlerFunc {
	handler := nextGoRouteHandler()
	return func(w http.ResponseWriter, r *http.Request) {
		params, matched, err := nextGoMatchParams(r.URL.EscapedPath())
		if err != nil {
			http.Error(w, "Invalid route parameters", http.StatusBadRequest)
			return
		}
		if !matched {
			http.NotFound(w, r)
			return
		}
		// Public requests cannot provide the private self-hosted transport metadata.
		r.Header.Del("x-next-internal-go-token")
		for name, values := range params {
			r.SetPathValue(name, strings.Join(values, "/"))
		}
		r = r.WithContext(context.WithValue(r.Context(), nextGoParamsKey{}, params))
		defer func() {
			if recovered := recover(); recovered != nil {
				fmt.Fprintln(os.Stderr, "native route panic:", recovered)
				panic(http.ErrAbortHandler)
			}
		}()
		handler(w, r)
	}
}
