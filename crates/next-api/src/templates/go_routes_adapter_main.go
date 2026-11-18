package main

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	// __NEXT_GO_ROUTE_IMPORTS__
)

// nextGoRoute is one route.go package. Adapter builds compile every route
// into this executable, and each Go route output points at it.
type nextGoRoute struct {
	match   func(path string) bool
	handler http.HandlerFunc
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
	// Routes are listed in Next.js route precedence order: static segments
	// before [param], before [...catchAll], before [[...optionalCatchAll]].
	// The first route matching the destination path handles the request.
	routes := []nextGoRoute{
		// __NEXT_GO_ROUTES__
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Adapter builds serve requests from the platform, not from Next.js, so
		// x-next-internal-* request headers can only come from the client.
		for name := range r.Header {
			if strings.HasPrefix(strings.ToLower(name), "x-next-internal-") {
				delete(r.Header, name)
			}
		}
		path := r.URL.EscapedPath()
		for _, route := range routes {
			if route.match(path) {
				route.handler(w, r)
				return
			}
		}
		http.NotFound(w, r)
	})}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
