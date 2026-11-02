package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
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

func nextGoMatchParams(path string) (map[string][]string, bool) {
	pattern := nextGoPathSegments(nextGoRoutePattern)
	encoded := nextGoPathSegments(path)
	segments := make([]string, len(encoded))
	for i, segment := range encoded {
		if segment == "" {
			return nil, false
		}
		decoded, err := url.PathUnescape(segment)
		if err != nil {
			return nil, false
		}
		segments[i] = decoded
	}
	params := map[string][]string{}
	index := 0
	for _, segment := range pattern {
		if strings.HasPrefix(segment, "[[...") && strings.HasSuffix(segment, "]]") {
			if index < len(segments) {
				params[segment[5:len(segment)-2]] = segments[index:]
			}
			return params, true
		}
		if strings.HasPrefix(segment, "[...") && strings.HasSuffix(segment, "]") {
			if index == len(segments) {
				return nil, false
			}
			params[segment[4:len(segment)-1]] = segments[index:]
			return params, true
		}
		if index == len(segments) {
			return nil, false
		}
		if strings.HasPrefix(segment, "[") && strings.HasSuffix(segment, "]") {
			params[segment[1:len(segment)-1]] = []string{segments[index]}
		} else if segment != segments[index] {
			return nil, false
		}
		index++
	}
	return params, index == len(segments)
}

func main() {
	port := os.Getenv("PORT")
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		panic("route.go adapter server requires a valid PORT")
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("0.0.0.0", port))
	if err != nil {
		panic(err)
	}
	handler := nextGoRouteHandler()
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		params, matched := nextGoMatchParams(r.URL.EscapedPath())
		if !matched {
			http.NotFound(w, r)
			return
		}
		// Public requests cannot provide the private self-hosted transport metadata.
		r.Header.Del("X-Next-Go-Token")
		r.Header.Del("X-Next-Go-Params")
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
	})}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
