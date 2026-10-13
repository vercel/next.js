package main

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

type nextGoParamsKey struct{}

// ParamValues returns decoded route parameters, including individual catch-all segments.
func ParamValues(r *http.Request, name string) []string {
	params, _ := r.Context().Value(nextGoParamsKey{}).(map[string][]string)
	return params[name]
}

func main() {
	token := os.Getenv("__NEXT_GO_TOKEN")
	if token == "" {
		panic("native route must be started by Next.js")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
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
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Next-Go-Token")), []byte(token)) != 1 {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		params := map[string][]string{}
		encoded, err := base64.RawURLEncoding.DecodeString(r.Header.Get("X-Next-Go-Params"))
		if err != nil || json.Unmarshal(encoded, &params) != nil {
			http.Error(w, "Invalid route parameters", http.StatusBadRequest)
			return
		}
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
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		_, _ = io.Copy(io.Discard, os.Stdin)
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	if _, err := fmt.Fprintf(os.Stdout, "\x1eNEXT_GO_READY:%s:%d\n", token, listener.Addr().(*net.TCPAddr).Port); err != nil {
		panic(err)
	}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
	<-shutdownDone
}
