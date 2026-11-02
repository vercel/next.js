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
)

func main() {
	token := os.Getenv("__NEXT_GO_TOKEN")
	if token == "" {
		panic("native route must be started by Next.js")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
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
	if _, err := fmt.Fprintf(os.Stdout, "\x1eNEXT_GO_READY:%s:%d\n", token, listener.Addr().(*net.TCPAddr).Port); err != nil {
		panic(err)
	}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
	<-shutdownDone
}
