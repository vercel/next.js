package main

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	// __NEXT_GO_ROUTE_IMPORTS__
)

func main() {
	// The adapter selects and authorizes an output before invoking its server.
	// Bind this process to that output using trusted process configuration.
	// Requests never select another handler from the shared executable.
	routes := map[string]http.HandlerFunc{
		// __NEXT_GO_ROUTES__
	}
	handler, ok := routes[os.Getenv("__NEXT_GO_ROUTE")]
	if !ok {
		panic("route.go adapter server requires __NEXT_GO_ROUTE set to its output.id")
	}
	port := os.Getenv("PORT")
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		panic("route.go adapter server requires a valid PORT")
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("0.0.0.0", port))
	if err != nil {
		panic(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Adapter builds serve requests from the platform, not from Next.js, so
		// x-next-internal-* request headers can only come from the client.
		for name := range r.Header {
			if strings.HasPrefix(strings.ToLower(name), "x-next-internal-") {
				delete(r.Header, name)
			}
		}
		handler(w, r)
	})}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
