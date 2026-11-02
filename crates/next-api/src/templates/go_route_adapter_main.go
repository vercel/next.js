package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
)

func nextGoAdapterHandler() http.HandlerFunc {
	configuration := os.Getenv("NEXT_GO_ADAPTER_ROUTING")
	if configuration == "" {
		return nextGoHandler()
	}
	var routing struct {
		Version    int    `json:"version"`
		PathHeader string `json:"pathHeader"`
	}
	if err := json.Unmarshal([]byte(configuration), &routing); err != nil || routing.Version != 1 || routing.PathHeader == "" {
		panic("invalid NEXT_GO_ADAPTER_ROUTING configuration")
	}
	for _, character := range routing.PathHeader {
		if !(character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || character == '-') {
			panic("invalid NEXT_GO_ADAPTER_ROUTING pathHeader")
		}
	}
	// The adapter must strip client values and set this header after routing.
	// Only parameter matching uses it; user code receives the forwarded URL.
	return nextGoHandlerWithPath(func(r *http.Request) (string, error) {
		values := r.Header.Values(routing.PathHeader)
		r.Header.Del(routing.PathHeader)
		if len(values) != 1 || !strings.HasPrefix(values[0], "/") || strings.HasPrefix(values[0], "//") || strings.ContainsAny(values[0], "?#\r\n") {
			return "", fmt.Errorf("expected one concrete pathname in %s", routing.PathHeader)
		}
		return values[0], nil
	})
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
	server := &http.Server{Handler: nextGoAdapterHandler()}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}
