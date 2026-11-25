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
	// The platform selects and authorizes an output before invoking the server.
	// Requests never select a handler by re-matching their pathname against the
	// compiled routes. Each request selects its output from x-matched-path, much
	// as the Next.js server reads it, unless the adapter binds the process to one
	// output at startup. See nextGoSelectHandler.
	routes := map[string]http.HandlerFunc{
		// __NEXT_GO_ROUTES__
	}
	// next build runs the executable once to surface failures in package
	// initialization, which has completed by now, as build errors.
	if os.Getenv("__NEXT_GO_STARTUP_CHECK") == "1" {
		return
	}
	handler := nextGoSelectHandler(routes)
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

const nextGoRouteRequirement = "route.go adapter server requires __NEXT_GO_ROUTE to be the output.id of a Go output in this build"

// nextGoSelectHandler reads trusted process configuration from the adapter.
// __NEXT_GO_ROUTE binds the process to the output with exactly that ID.
// Otherwise each request selects its output from x-matched-path, which the
// platform sets from its routing decision and clients cannot set, much as the
// Next.js server reads it in minimal mode (see nextGoSelectMatchedPath). A
// request that selects no output gets a 404. The pathname never selects one.
func nextGoSelectHandler(routes map[string]http.HandlerFunc) http.HandlerFunc {
	if selected, ok := os.LookupEnv("__NEXT_GO_ROUTE"); ok {
		handler, ok := routes[selected]
		if !ok {
			panic(nextGoRouteRequirement)
		}
		return handler
	}
	return nextGoMatchedPathHandler(routes)
}
