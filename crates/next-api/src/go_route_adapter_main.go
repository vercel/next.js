package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const nextGoRoutePattern = "__NEXT_GO_ROUTE_PATTERN__"

type nextGoParamsKey struct{}

type nextGoAdapterRouting struct {
	Version    int    `json:"version"`
	PathHeader string `json:"pathHeader"`
}

func nextGoRoutingConfig() (*nextGoAdapterRouting, error) {
	raw := os.Getenv("__NEXT_GO_ADAPTER_ROUTING")
	if raw == "" {
		return nil, nil
	}
	invalid := fmt.Errorf("invalid __NEXT_GO_ADAPTER_ROUTING: expected version 1 and a valid pathHeader")
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	var config nextGoAdapterRouting
	if err := decoder.Decode(&config); err != nil || config.Version != 1 || config.PathHeader == "" {
		return nil, invalid
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, invalid
	}
	for _, char := range config.PathHeader {
		if char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' || strings.ContainsRune("!#$%&'*+-.^_`|~", char) {
			continue
		}
		return nil, invalid
	}
	return &config, nil
}

func nextGoRoutingPath(r *http.Request, config *nextGoAdapterRouting) (string, error) {
	if config == nil {
		return r.URL.EscapedPath(), nil
	}
	values := r.Header.Values(config.PathHeader)
	r.Header.Del(config.PathHeader)
	if len(values) != 1 || !strings.HasPrefix(values[0], "/") || strings.HasPrefix(values[0], "//") || strings.ContainsAny(values[0], "?#\\") {
		return "", fmt.Errorf("missing or invalid adapter routing path")
	}
	parsed, err := url.ParseRequestURI(values[0])
	if err != nil || parsed.EscapedPath() != values[0] {
		return "", fmt.Errorf("invalid adapter routing path")
	}
	return values[0], nil
}

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
	routing, err := nextGoRoutingConfig()
	if err != nil {
		panic(err)
	}
	port := os.Getenv("PORT")
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		panic("route.go adapter server requires a valid PORT")
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", port))
	if err != nil {
		panic(err)
	}
	methods := map[string]bool{}
	for _, method := range Methods {
		methods[method] = true
	}
	if methods["GET"] {
		methods["HEAD"] = true
	}
	methods["OPTIONS"] = true
	allow := []string{}
	for _, method := range []string{"GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"} {
		if methods[method] {
			allow = append(allow, method)
		}
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// A configured adapter owns the trusted routing header. Match its concrete
		// escaped path without changing the public URL observed by the handler.
		path, err := nextGoRoutingPath(r, routing)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		params, matched := nextGoMatchParams(path)
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
		if !methods[r.Method] {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if r.Method == "OPTIONS" {
			w.Header().Set("Allow", strings.Join(allow, ", "))
			w.WriteHeader(http.StatusNoContent)
			return
		}
		defer func() {
			if recovered := recover(); recovered != nil {
				fmt.Fprintln(os.Stderr, "native route panic:", recovered)
				panic(http.ErrAbortHandler)
			}
		}()
		Handle(w, r)
	})}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
