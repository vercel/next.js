package main

import (
	"net"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"strconv"
	"strings"
	// __NEXT_GO_ROUTE_IMPORTS__
)

func main() {
	// The adapter selects and authorizes an output before invoking its server.
	// Requests never select a handler by re-matching their pathname against the
	// compiled routes. The process either binds to one output at startup, or,
	// when one deployed function serves every Go output, reads the selected
	// output from a routing header that the platform sets and clients cannot.
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

const nextGoRouteRequirement = "route.go adapter server requires __NEXT_GO_ROUTE set to its output.id, " +
	"or __NEXT_GO_ROUTE_HEADER set to a routing header that the platform sets to the selected output.id"

// nextGoSelectHandler reads trusted process configuration from the adapter.
// __NEXT_GO_ROUTE binds the process to one output. __NEXT_GO_ROUTE_HEADER names
// a request header that carries the selected output ID on each request.
func nextGoSelectHandler(routes map[string]http.HandlerFunc) http.HandlerFunc {
	selected, hasSelected := os.LookupEnv("__NEXT_GO_ROUTE")
	header, hasHeader := os.LookupEnv("__NEXT_GO_ROUTE_HEADER")
	if hasSelected && hasHeader {
		panic("route.go adapter server accepts either __NEXT_GO_ROUTE or __NEXT_GO_ROUTE_HEADER, not both")
	}
	if hasHeader {
		return nextGoHeaderHandler(routes, header)
	}
	handler, ok := routes[selected]
	if !hasSelected || !ok {
		panic(nextGoRouteRequirement)
	}
	return handler
}

func nextGoHeaderHandler(routes map[string]http.HandlerFunc, header string) http.HandlerFunc {
	if !nextGoValidHeaderName(header) {
		panic("route.go adapter server requires __NEXT_GO_ROUTE_HEADER to be a valid HTTP header name")
	}
	// The server removes x-next-internal-* headers before dispatch, so such a
	// header could never select an output.
	if strings.HasPrefix(strings.ToLower(header), "x-next-internal-") {
		panic("route.go adapter server cannot select outputs with an x-next-internal-* header")
	}
	header = textproto.CanonicalMIMEHeaderKey(header)
	return func(w http.ResponseWriter, r *http.Request) {
		values := r.Header.Values(header)
		if len(values) != 1 {
			http.NotFound(w, r)
			return
		}
		handler, ok := nextGoLookupRoute(routes, values[0])
		if !ok {
			http.NotFound(w, r)
			return
		}
		handler(w, r)
	}
}

// nextGoLookupRoute matches a header value to an output ID. Platforms may
// percent-encode non-ASCII or reserved characters in the header, so a value
// that is not an output ID is also tried decoded. The platform sets the value
// and clients cannot, so decoding does not widen what a request can select.
func nextGoLookupRoute(routes map[string]http.HandlerFunc, value string) (http.HandlerFunc, bool) {
	if handler, ok := routes[value]; ok {
		return handler, true
	}
	decoded, err := url.PathUnescape(value)
	if err != nil || decoded == value {
		return nil, false
	}
	handler, ok := routes[decoded]
	return handler, ok
}

func nextGoValidHeaderName(name string) bool {
	if name == "" {
		return false
	}
	for _, ch := range name {
		// RFC 9110 token characters.
		if ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' {
			continue
		}
		if !strings.ContainsRune("!#$%&'*+-.^_`|~", ch) {
			return false
		}
	}
	return true
}
