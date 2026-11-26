package main

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"

	nextroute "__NEXT_GO_ROUTE_IMPORT__"
)

var nextGoProxyConditionHeaders = []string{
	// __NEXT_GO_PROXY_CONDITION_HEADERS__
}

// The platform evaluates Has/Missing before invoking the proxy. Validate the
// same fields in routes too, so skipping the proxy cannot expose a different
// interpretation of the request to Go's Header.Get or Cookie methods.
func nextGoValidConditionHeaders(r *http.Request) bool {
	for _, name := range nextGoProxyConditionHeaders {
		values := r.Header.Values(name)
		if len(values) == 0 {
			continue
		}
		// Node combines Cookie fields with semicolons, including for header
		// conditions. Go's Cookie methods then inspect the same combined field.
		if name == "cookie" {
			r.Header.Set(name, strings.Join(values, "; "))
		} else if len(values) > 1 {
			return false
		}
		switch name {
		case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade":
			return false
		}
		if strings.HasPrefix(name, "x-next-internal-") {
			return false
		}
		for _, connection := range r.Header.Values("Connection") {
			for _, field := range strings.Split(connection, ",") {
				if strings.EqualFold(strings.TrimSpace(field), name) {
					return false
				}
			}
		}
	}
	return true
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
	// Adapter builds serve requests from the platform, not from Next.js, so
	// x-next-internal-* request headers can only come from the client.
	handler := nextroute.NextInternalGoHandler(false)
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !nextGoValidConditionHeaders(r) {
			http.Error(w, "Go proxy conditions require unambiguous request headers", http.StatusBadRequest)
			return
		}
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
