// Generated application worker. The public frontend is shipped separately.
package main

import (
	"bufio"
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
	/*IMPORTS*/)

var handlers = map[string]func(http.ResponseWriter, *http.Request, map[string][]string){ /*ROUTES*/ }

func main() {
	input := bufio.NewReaderSize(os.Stdin, 4096)
	line, e := input.ReadSlice('\n')
	var config struct {
		Version int    `json:"version"`
		Socket  string `json:"socket"`
		Token   string `json:"token"`
	}
	if e != nil || len(line) > 4096 || json.Unmarshal(line, &config) != nil || config.Version != 1 || len(config.Token) != 64 {
		panic("invalid worker control message")
	}
	listener, e := net.Listen("unix", config.Socket)
	if e != nil {
		panic(e)
	}
	defer os.Remove(config.Socket)
	if e = os.Chmod(config.Socket, 0600); e != nil {
		panic(e)
	}
	server := http.Server{ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 300 * time.Second, WriteTimeout: 300 * time.Second, IdleTimeout: 15 * time.Second, MaxHeaderBytes: 32768, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("X-Next-Go-Upstream-Token")
		encoded := r.Header.Get("X-Next-Go-Metadata")
		remote := r.Header.Get("X-Next-Go-Remote")
		for name := range r.Header {
			if strings.HasPrefix(strings.ToLower(name), "x-next-go-") {
				delete(r.Header, name)
			}
		}
		if subtle.ConstantTimeCompare([]byte(token), []byte(config.Token)) != 1 || len(encoded) > 32768 {
			http.Error(w, "Forbidden", 403)
			return
		}
		b, e := base64.RawURLEncoding.DecodeString(encoded)
		var data struct {
			Handler string              `json:"handler"`
			Params  map[string][]string `json:"params"`
		}
		if e != nil || json.Unmarshal(b, &data) != nil {
			http.Error(w, "Invalid worker metadata", 400)
			return
		}
		handler, ok := handlers[data.Handler]
		if !ok {
			http.Error(w, "Unknown handler", 404)
			return
		}
		if net.ParseIP(remote) == nil {
			http.Error(w, "Invalid peer", 400)
			return
		}
		r.RemoteAddr = net.JoinHostPort(remote, "0")
		defer func() {
			if recovered := recover(); recovered != nil {
				fmt.Fprintln(os.Stderr, "native route panic:", recovered)
				panic(http.ErrAbortHandler)
			}
		}()
		handler(w, r, data.Params)
	})}
	done := make(chan struct{})
	go func() {
		defer close(done)
		io.Copy(io.Discard, input)
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()
	ready := os.NewFile(3, "worker readiness")
	if ready == nil {
		panic("missing worker readiness channel")
	}
	if _, e = io.WriteString(ready, "next-worker-http/1\n"); e != nil {
		panic(e)
	}
	ready.Close()
	if e = server.Serve(listener); e != nil && e != http.ErrServerClosed {
		panic(e)
	}
	<-done
}
