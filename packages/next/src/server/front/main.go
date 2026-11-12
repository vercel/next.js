// next-front owns `next start`'s public port and forwards every request,
// unchanged, to the Node server on a private loopback port. It makes no
// routing decisions; later stages move work here from Node.
//
// Contract with Node (packages/next/src/server/lib/front-server.ts):
//
//		next-front --listen :3000 --upstream 127.0.0.1:51234 --idle-timeout-ms 5000
//
//	  - Once it listens, it prints `NEXT_FRONT_READY <port>` on stdout.
//	  - If it can't listen, it prints "Failed to start server" on stderr and
//	    exits 1.
//	  - On stdin EOF (Node exited or asked it to stop), SIGINT or SIGTERM it
//	    stops accepting, finishes in-flight requests and exits 0.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

func main() {
	listen := flag.String("listen", "", "public address, like :3000 or 127.0.0.1:3000")
	upstream := flag.String("upstream", "", "Node's private address, like 127.0.0.1:51234")
	idleTimeoutMs := flag.Int("idle-timeout-ms", 5000, "how long an idle client connection stays open")
	flag.Parse()
	if *listen == "" || *upstream == "" {
		fmt.Fprintln(os.Stderr, "next-front: --listen and --upstream are required")
		os.Exit(2)
	}

	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to start server:", err)
		os.Exit(1)
	}
	addr := ln.Addr().(*net.TCPAddr)

	srv := &http.Server{
		Handler:     newProxy(*upstream, addr),
		IdleTimeout: time.Duration(*idleTimeoutMs) * time.Millisecond,
		ErrorLog:    log.New(os.Stderr, "next-front: ", 0),
	}

	fmt.Printf("NEXT_FRONT_READY %d\n", addr.Port)

	stopped := make(chan struct{})
	go func() {
		<-stopRequested()
		// No deadline: like Node's server.close(), wait for every in-flight
		// request, however long it streams.
		if err := srv.Shutdown(context.Background()); err != nil {
			fmt.Fprintln(os.Stderr, "next-front: shutdown:", err)
		}
		// Shutdown doesn't track hijacked connections; wait for the responses
		// writeCustomStatusLine is still sending.
		hijackedResponses.Wait()
		close(stopped)
	}()

	if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, "next-front:", err)
		os.Exit(1)
	}
	<-stopped
}

// stopRequested is closed on stdin EOF, SIGINT or SIGTERM, whichever comes
// first. Stdin is a pipe from Node, so EOF also means Node has died.
func stopRequested() <-chan struct{} {
	stop := make(chan struct{})
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	stdinClosed := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, os.Stdin)
		close(stdinClosed)
	}()
	go func() {
		select {
		case <-signals:
		case <-stdinClosed:
		}
		close(stop)
	}()
	return stop
}

// newProxy forwards to Node at upstream. public is the address the front
// listens on.
func newProxy(upstream string, public *net.TCPAddr) http.Handler {
	publicPort := strconv.Itoa(public.Port)
	// Node, listening on all interfaces, sees IPv4 clients as IPv4-mapped IPv6
	// addresses. Go reports them as plain IPv4.
	mapIPv4 := public.IP.To4() == nil

	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme = "http"
			pr.Out.URL.Host = upstream
			pr.Out.Host = pr.In.Host
			keepRequestTarget(pr.Out, pr.In.RequestURI)
			restoreForwardedHeaders(pr.Out.Header, pr.In.Header)
			setIfMissing(pr.Out.Header, "X-Forwarded-For", clientIP(pr.In.RemoteAddr, mapIPv4))
			setIfMissing(pr.Out.Header, "X-Forwarded-Port", publicPort)
		},
		// Write each chunk to the client as soon as Node sends it.
		FlushInterval: -1,
		Transport: &http.Transport{
			Proxy:       nil,
			DialContext: (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			// The default of 2 idle connections per host churns connections
			// under load.
			MaxIdleConns:        0,
			MaxIdleConnsPerHost: 512,
			// Below Node's 5 s keep-alive, so a request never goes out on a
			// connection Node is closing.
			IdleConnTimeout: 4 * time.Second,
			// Otherwise Go asks Node for gzip and decompresses the response.
			DisableCompression:    true,
			ExpectContinueTimeout: 1 * time.Second,
		},
		ModifyResponse: writeCustomStatusLine,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			if errors.Is(err, errResponseWritten) {
				return
			}
			proxyErrorLog.Printf("proxy error: %v", err)
			w.WriteHeader(http.StatusBadGateway)
		},
		ErrorLog: proxyErrorLog,
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// A nil Content-Type stops Go from sniffing one when Node sent none;
		// the proxy appends Node's value when it has one.
		w.Header()["Content-Type"] = nil
		proxy.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), responseWriterKey{}, w)))
	})
}

var proxyErrorLog = log.New(os.Stderr, "next-front: ", 0)

type responseWriterKey struct{}

// errResponseWritten tells the ErrorHandler that writeCustomStatusLine already
// sent the response.
var errResponseWritten = errors.New("response written on the hijacked connection")

// hijackedResponses counts the responses writeCustomStatusLine is sending.
// Each is added before its connection is hijacked, while Shutdown still waits
// for that connection, so the count can't go up from zero after Shutdown
// returns.
var hijackedResponses sync.WaitGroup

// writeCustomStatusLine sends Node's response itself when its status line
// isn't the one Go's server would write. Node lets apps set any reason phrase
// (`res.statusMessage`, like "400 Invalid JSON") and uses its own texts for
// some codes ("413 Payload Too Large"); Go's ResponseWriter always writes
// http.StatusText. Such responses are rare (mostly errors), so the front takes
// the client connection over, writes the response byte for byte, and closes
// the connection afterwards.
func writeCustomStatusLine(res *http.Response) error {
	if res.Status == fmt.Sprintf("%d %s", res.StatusCode, http.StatusText(res.StatusCode)) {
		return nil
	}
	w, ok := res.Request.Context().Value(responseWriterKey{}).(http.ResponseWriter)
	if !ok {
		return nil
	}
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		return nil
	}
	hijackedResponses.Add(1)
	defer hijackedResponses.Done()
	conn, buf, err := hijacker.Hijack()
	if err != nil {
		return nil
	}
	defer conn.Close()

	header := res.Header.Clone()
	header.Set("Connection", "close")
	// The Transport removed chunked framing; the closed connection ends the
	// body unless Node sent its length.
	header.Del("Transfer-Encoding")
	if res.ContentLength >= 0 {
		header.Set("Content-Length", strconv.FormatInt(res.ContentLength, 10))
	}
	fmt.Fprintf(buf, "HTTP/1.1 %s\r\n", res.Status)
	header.Write(buf)
	buf.WriteString("\r\n")
	if err := buf.Flush(); err == nil && res.Request.Method != http.MethodHead {
		io.Copy(conn, res.Body)
	}
	return errResponseWritten
}

// keepRequestTarget makes the outgoing request line carry the path exactly as
// the client sent it. Go re-escapes some paths it parsed, for example raw
// non-ASCII bytes.
func keepRequestTarget(out *http.Request, requestURI string) {
	path, query, hasQuery := strings.Cut(requestURI, "?")
	out.URL.RawQuery = query
	out.URL.ForceQuery = hasQuery && query == ""
	// Only origin-form targets. An Opaque starting with "//" would be sent as
	// an absolute URL, so those keep Go's escaping.
	if strings.HasPrefix(path, "/") && !strings.HasPrefix(path, "//") && out.URL.EscapedPath() != path {
		out.URL.Opaque = path
	}
}

// With Rewrite set, ReverseProxy removes these from the outgoing request
// before Rewrite runs. Put back exactly what the client sent.
var forwardedHeaders = []string{"Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto"}

func restoreForwardedHeaders(out, in http.Header) {
	for _, name := range forwardedHeaders {
		if values, ok := in[name]; ok {
			out[name] = values
		}
	}
}

func setIfMissing(h http.Header, name, value string) {
	if _, ok := h[name]; !ok && value != "" {
		h[name] = []string{value}
	}
}

// clientIP formats the client address the way Node reports
// socket.remoteAddress.
func clientIP(remoteAddr string, mapIPv4 bool) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return ""
	}
	if ip := net.ParseIP(host); ip != nil && ip.To4() != nil && mapIPv4 {
		return "::ffff:" + ip.To4().String()
	}
	return host
}
