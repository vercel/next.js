package main

import (
	"context"
	"crypto/subtle"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"time"
	// __NEXT_GO_ROUTE_IMPORTS__
)

func main() {
	// One worker serves every route.go of a production build. Next.js routes each
	// request, including rewrites and proxy.ts, and names the selected route's
	// exact ID in x-matched-path. Requests never select a handler by pathname.
	routes := map[string]http.HandlerFunc{
		// __NEXT_GO_ROUTES__
	}
	// next build runs the executable once to surface failures in package
	// initialization, which has completed by now, as build errors.
	if os.Getenv("__NEXT_GO_STARTUP_CHECK") == "1" {
		return
	}
	token := os.Getenv("__NEXT_GO_TOKEN")
	if token == "" {
		panic("native route must be started by Next.js")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	// Next.js, or Switchyard, authenticates every request with this worker's
	// token and replaces client-supplied x-matched-path and x-next-internal-*
	// headers before forwarding, so x-matched-path is trusted once the token
	// matches. It carries the route ID as is, so unlike an adapter executable,
	// which reads x-matched-path as the Next.js server does, this one looks up
	// the exact ID.
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("x-next-internal-go-token")), []byte(token)) != 1 {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		selected := r.Header.Values("X-Matched-Path")
		if len(selected) != 1 {
			http.NotFound(w, r)
			return
		}
		handler, ok := routes[selected[0]]
		if !ok {
			http.NotFound(w, r)
			return
		}
		handler(w, r)
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
