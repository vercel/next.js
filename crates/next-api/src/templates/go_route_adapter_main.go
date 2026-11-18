package main

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
)

// Adapter builds serve requests from the platform, not from Next.js, so
// x-next-internal-* request headers can only come from the client.
const nextGoTrustInternalHeaders = false

// Platforms invoke adapter builds with the original request URL.
const nextGoURLNormalizedByNext = false

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
	handler := nextGoHandler()
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
