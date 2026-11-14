package main

import (
	"context"
	"crypto/subtle"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"
)

func main() {
	token := os.Getenv("__NEXT_GO_TOKEN")
	if token == "" {
		panic("native route must be started by Next.js")
	}
	// Node passes a Unix socket path in a private directory when it can; the
	// worker falls back to a loopback port, and its readiness line says which.
	listener, err := listen(os.Getenv("__NEXT_GO_SOCKET"))
	if err != nil {
		panic(err)
	}
	address := "unix"
	if tcp, ok := listener.Addr().(*net.TCPAddr); ok {
		address = strconv.Itoa(tcp.Port)
	}
	handler := nextGoHandler()
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("x-next-internal-go-token")), []byte(token)) != 1 {
			http.Error(w, "Forbidden", http.StatusForbidden)
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
	if _, err := fmt.Fprintf(os.Stdout, "\x1eNEXT_GO_READY:%s:%s\n", token, address); err != nil {
		panic(err)
	}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
	<-shutdownDone
}

func listen(socketPath string) (net.Listener, error) {
	if socketPath != "" {
		if listener, err := net.Listen("unix", socketPath); err == nil {
			return listener, nil
		}
	}
	return net.Listen("tcp", "127.0.0.1:0")
}
