// next-front owns `next start`'s public port and forwards requests, unchanged,
// to the Node server on a private loopback port. Once Node sends it a route
// table, it sends route.go requests that Node would pass on unchanged straight
// to their Go workers instead (direct.go, and the routing package for the
// decision).
//
// Contract with Node (packages/next/src/server/lib/front-server.ts):
//
//		next-front --listen :3000 --upstream 127.0.0.1:51234 \
//		  --idle-timeout-ms 5000 --header-timeout-ms 60000 \
//		  --request-timeout-ms 300000 --upstream-idle-ms 4000
//
//	  - Every flag is required. Node passes every behavior value, read off its
//	    own server, so the front has no defaults of its own.
//	  - Once it listens, it prints `NEXT_FRONT_READY <port>` on stdout.
//	  - If it can't listen, it prints the error on stderr and exits 1; Node
//	    reports "Failed to start server".
//	  - Node writes control messages to stdin, one JSON object per line
//	    (control.go): the route table, then route.go workers as they start
//	    and stop.
//	  - On stdin EOF (Node exited or asked it to stop), SIGINT or SIGTERM it
//	    stops accepting, finishes in-flight requests and exits 0.
package main

import (
	"bytes"
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

// config is the command line. Node sets every field.
type config struct {
	listen   string
	upstream string
	// Client keep-alive: Node's keepAliveTimeout, or --keepAliveTimeout.
	idleTimeout time.Duration
	// Node's headersTimeout: how long a client may take to send its request
	// headers. Without it, clients that never finish their headers would hold
	// the front's connections forever, and Node, which only sees complete
	// requests, couldn't time them out.
	headerTimeout time.Duration
	// Node's requestTimeout: how long a client may take to send the whole
	// request, headers and body. Node's own limit doesn't cover the front's
	// side of the connection: a request Go's server answers itself never
	// reaches Node, and Go keeps reading a body Node has stopped waiting for.
	// 0 means no limit, as in Node.
	requestTimeout time.Duration
	// How long the front keeps an idle connection to Node: below Node's
	// keep-alive, so a request never goes out on a connection Node is
	// closing.
	upstreamIdle time.Duration
}

func parseConfig(args []string) (config, error) {
	flags := flag.NewFlagSet("next-front", flag.ContinueOnError)
	listen := flags.String("listen", "", "public address, like :3000 or 127.0.0.1:3000")
	upstream := flags.String("upstream", "", "Node's private address, like 127.0.0.1:51234")
	idleMs := flags.Int("idle-timeout-ms", 0, "how long an idle client connection stays open")
	headerMs := flags.Int("header-timeout-ms", 0, "how long a client may take to send request headers")
	requestMs := flags.Int("request-timeout-ms", 0, "how long a client may take to send a whole request; 0 means no limit")
	upstreamIdleMs := flags.Int("upstream-idle-ms", 0, "how long an idle connection to Node stays pooled")
	if err := flags.Parse(args); err != nil {
		return config{}, err
	}
	set := map[string]bool{}
	flags.Visit(func(f *flag.Flag) { set[f.Name] = true })
	var missing []string
	flags.VisitAll(func(f *flag.Flag) {
		if !set[f.Name] {
			missing = append(missing, "--"+f.Name)
		}
	})
	if len(missing) > 0 {
		return config{}, fmt.Errorf("missing %s", strings.Join(missing, ", "))
	}
	ms := func(n int) time.Duration { return time.Duration(n) * time.Millisecond }
	return config{
		listen:         *listen,
		upstream:       *upstream,
		idleTimeout:    ms(*idleMs),
		headerTimeout:  ms(*headerMs),
		requestTimeout: ms(*requestMs),
		upstreamIdle:   ms(*upstreamIdleMs),
	}, nil
}

func main() {
	cfg, err := parseConfig(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "next-front:", err)
		os.Exit(2)
	}

	ln, err := net.Listen("tcp", cfg.listen)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	addr := ln.Addr().(*net.TCPAddr)

	f := newFront(newProxy(cfg.upstream, addr, cfg.upstreamIdle), addr, cfg.upstreamIdle)
	srv := newServer(f, cfg.idleTimeout, cfg.headerTimeout, cfg.requestTimeout)

	fmt.Printf("NEXT_FRONT_READY %d\n", addr.Port)

	stopped := make(chan struct{})
	go func() {
		<-stopRequested(f.apply)
		// No deadline: like Node's server.close(), wait for every in-flight
		// request, however long it streams.
		if err := srv.Shutdown(context.Background()); err != nil {
			fmt.Fprintln(os.Stderr, "next-front: shutdown:", err)
		}
		close(stopped)
	}()

	if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, "next-front:", err)
		os.Exit(1)
	}
	<-stopped
}

// newServer is the public server. It times out what Node times out: idle
// keep-alive connections, request headers, and whole requests. Responses
// aren't limited, so long streams aren't cut off, as in Node.
func newServer(handler http.Handler, idleTimeout, headerTimeout, requestTimeout time.Duration) *frontServer {
	return &frontServer{&http.Server{
		Handler:           handler,
		IdleTimeout:       idleTimeout,
		ReadHeaderTimeout: headerTimeout,
		// Reading a request, body included, must finish within Node's
		// requestTimeout. Go clears the deadline when a connection is taken
		// over for a WebSocket upgrade, so those aren't cut off.
		ReadTimeout: requestTimeout,
		// Go's server answers "OPTIONS *" itself by default, reading the body
		// with no deadline and never calling the handler. Forward it to Node
		// instead, as without the front.
		DisableGeneralOptionsHandler: true,
		ErrorLog:                     log.New(os.Stderr, "next-front: ", 0),
		ConnContext: func(ctx context.Context, conn net.Conn) context.Context {
			return context.WithValue(ctx, statusConnKey{}, conn)
		},
	}}
}

// Keep net/http in charge of request bodies, cancellation and shutdown. The
// connection adapter only replaces the reason phrase in a response status line.
type frontServer struct{ *http.Server }

func (s *frontServer) Serve(ln net.Listener) error {
	return s.Server.Serve(statusListener{ln})
}

type statusListener struct{ net.Listener }

func (ln statusListener) Accept() (net.Conn, error) {
	conn, err := ln.Listener.Accept()
	if err != nil {
		return nil, err
	}
	return &statusConn{Conn: conn}, nil
}

type statusConnKey struct{}

type statusConn struct {
	net.Conn
	mu       sync.Mutex
	status   string
	header   []byte
	writeErr error
}

func (c *statusConn) setStatus(status string) {
	c.mu.Lock()
	c.status = status
	c.mu.Unlock()
}

func (c *statusConn) Write(p []byte) (int, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.writeErr != nil {
		return 0, c.writeErr
	}
	if c.status == "" {
		return c.Conn.Write(p)
	}

	buffered := len(c.header)
	c.header = append(c.header, p...)
	consumed, rewriteAt, oldLineLen, newLineLen := 0, -1, 0, 0
	var wire []byte
	for consumed < len(c.header) {
		remaining := c.header[consumed:]
		lineEnd := bytes.Index(remaining, []byte("\r\n"))
		if lineEnd < 0 {
			break
		}
		line := remaining[:lineEnd]
		if len(line) >= 12 && bytes.HasPrefix(line, []byte("HTTP/1.")) && line[8] == ' ' {
			if string(line[9:12]) == c.status[:3] {
				rewriteAt = consumed
				oldLineLen, newLineLen = lineEnd+2, 9+len(c.status)+2
				wire = append(wire, c.header[:consumed+9]...)
				wire = append(wire, c.status...)
				wire = append(wire, remaining[lineEnd:]...)
				consumed = len(c.header)
				c.status = ""
				break
			}
			if line[9] == '1' && string(line[9:12]) != "101" {
				// An automatic 100 Continue can race with the final response.
				// Skip its entire header block, never looking inside its fields.
				end := bytes.Index(remaining, []byte("\r\n\r\n"))
				if end < 0 {
					break
				}
				consumed += end + 4
				continue
			}
		}
		// An unexpected final response must pass through unchanged. Never scan
		// its headers or body for something that resembles a status line.
		consumed = len(c.header)
		c.status = ""
		break
	}
	if wire == nil {
		wire = c.header[:consumed]
	}
	if len(wire) == 0 {
		return len(p), nil
	}
	buffers := net.Buffers{wire}
	written, err := buffers.WriteTo(c.Conn)
	if err == nil && written != int64(len(wire)) {
		err = io.ErrShortWrite
	}
	if err != nil {
		c.writeErr = err
		// Counts refer to the caller's input, even when the reason phrase grew
		// or shrank. A partly written replacement line isn't consumed yet.
		n := int(written)
		if rewriteAt >= 0 && n > rewriteAt {
			if n < rewriteAt+newLineLen {
				n = rewriteAt
			} else {
				n += oldLineLen - newLineLen
			}
		}
		return max(0, min(len(p), n-buffered)), err
	}
	c.header = c.header[consumed:]
	if c.status == "" {
		c.header = nil
	}
	return len(p), nil
}

// ReverseProxy uses TCP half-close to finish upgraded connections.
func (c *statusConn) CloseWrite() error {
	if conn, ok := c.Conn.(interface{ CloseWrite() error }); ok {
		return conn.CloseWrite()
	}
	return errors.New("connection does not support CloseWrite")
}

// stopRequested is closed on stdin EOF, SIGINT or SIGTERM, whichever comes
// first. Stdin is a pipe from Node, so EOF also means Node has died. Until
// then, each line Node writes there is a control message for apply.
func stopRequested(apply func(controlMessage)) <-chan struct{} {
	stop := make(chan struct{})
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	stdinClosed := make(chan struct{})
	go func() {
		readControl(os.Stdin, apply, func(err error) {
			proxyErrorLog.Printf("control message: %v", err)
		})
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
// listens on; upstreamIdle is how long an idle connection to Node stays
// pooled.
//
// Node should receive the same request, and the client the same response, as
// without the front. Go's server and proxy change a few things on their own;
// the comments below say what each one is and how the code undoes it.
func newProxy(upstream string, public *net.TCPAddr, upstreamIdle time.Duration) http.Handler {
	publicPort := strconv.Itoa(public.Port)
	// Go reports an IPv4 client as plain IPv4 (10.0.0.5), but Node, listening
	// on all interfaces, reports it as IPv4-mapped IPv6 (::ffff:10.0.0.5).
	// clientIP uses Node's form when this is set, so Node sees the same
	// X-Forwarded-For value as without the front.
	mapIPv4 := public.IP.To4() == nil

	proxy := &httputil.ReverseProxy{
		// Rewrite builds the request to Node (pr.Out) from the one the client
		// sent (pr.In). It runs once per request, before anything goes to Node.
		Rewrite: func(pr *httputil.ProxyRequest) {
			// Connect to Node.
			pr.Out.URL.Scheme = "http"
			pr.Out.URL.Host = upstream
			// Keep the client's Host header. pr.Out starts as a copy of
			// pr.In, so it already has it; this guards against ProxyRequest's
			// SetURL helper, which would clear it and make Go send Node's
			// address instead.
			pr.Out.Host = pr.In.Host
			// Go re-escapes some request paths and drops query parameters it
			// can't parse; keepRequestTarget sends the target as the client
			// did, so Node sees the same URL as without the front.
			keepRequestTarget(pr.Out, pr.In.RequestURI)
			// With Rewrite, Go deletes the client's forwarded headers before
			// this function runs; put them back, so Node sees them as before.
			restoreForwardedHeaders(pr.Out.Header, pr.In.Header)
			// Node now sees the front's connection (127.0.0.1 and its private
			// port) instead of the client's, so pass on the client's address
			// and the public port when no proxy in front of us already did.
			setIfMissing(pr.Out.Header, "X-Forwarded-For", clientIP(pr.In.RemoteAddr, mapIPv4))
			setIfMissing(pr.Out.Header, "X-Forwarded-Port", publicPort)
		},
		// By default the proxy only passes response bytes on when Go's write
		// buffer fills or the response ends (except for event streams and
		// responses of unknown length). -1 writes each chunk to the client as
		// soon as Node sends it, as without the front.
		FlushInterval: -1,
		Transport: &http.Transport{
			// Connect to Node directly, never through an HTTP_PROXY. A new
			// Transport already does that (only http.DefaultTransport reads
			// HTTP_PROXY); this says so.
			Proxy:       nil,
			DialContext: (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			// Go keeps only 2 idle connections per host by default, which
			// opens and closes connections to Node under load.
			MaxIdleConns:        0,
			MaxIdleConnsPerHost: 512,
			IdleConnTimeout:     upstreamIdle,
			// When the client sent no Accept-Encoding, Go adds "Accept-Encoding:
			// gzip" to the request to Node and unzips the response itself. This
			// turns that off, so compression stays between the client and Node.
			DisableCompression:    true,
			ExpectContinueTimeout: 1 * time.Second,
		},
		ModifyResponse: keepStatusLine,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			proxyErrorLog.Printf("proxy error: %v", err)
			// If the request had a body, part of it may still be unread (the
			// request timed out mid-upload, or Node went away). In full-duplex
			// mode Go's server keeps the connection open after this answer, and
			// would read the rest of the body as the next request. Closing the
			// connection avoids that, as Go's server does by itself without
			// full-duplex mode.
			if r.ContentLength != 0 {
				w.Header().Set("Connection", "close")
			}
			w.WriteHeader(http.StatusBadGateway)
		},
		ErrorLog: proxyErrorLog,
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Go's server guesses a type from the body ("sniffs") when a response
		// has no Content-Type, and Node never does. Marking Content-Type as
		// present but empty stops the guess, so a response without one stays
		// without one. When Node sends one, the proxy's copyHeader adds
		// Node's value to this entry before the headers are written.
		w.Header()["Content-Type"] = nil
		// Go's HTTP/1 server reads the rest of the request body before it
		// sends any of the response. Node doesn't: it can answer (a 403, or a
		// streamed response) while the client is still uploading. Full-duplex
		// mode lets the response go out as Node sends it. It fails only for
		// HTTP/2, which the front doesn't serve.
		http.NewResponseController(w).EnableFullDuplex()
		proxy.ServeHTTP(w, r)
	})
}

var proxyErrorLog = log.New(os.Stderr, "next-front: ", 0)

// Go chooses its own reason phrase. Preserve Node's at the connection boundary
// while leaving all HTTP framing and connection management to net/http.
func keepStatusLine(res *http.Response) error {
	// ReverseProxy's upgrade handler already preserves the reason phrase and
	// relays bytes in both directions. A 101 must reach that handler.
	if res.StatusCode == http.StatusSwitchingProtocols {
		return nil
	}
	if res.Status == fmt.Sprintf("%d %s", res.StatusCode, http.StatusText(res.StatusCode)) {
		return nil
	}
	if conn, ok := res.Request.Context().Value(statusConnKey{}).(*statusConn); ok {
		conn.setStatus(res.Status)
	}
	return nil
}

// keepRequestTarget makes the outgoing request line carry the target exactly
// as the client sent it. Go writes the request line from the
// URL it parsed, which can differ: it re-escapes some paths (raw "/é" becomes
// "/%C3%A9"), and with Rewrite it drops query parameters it can't parse.
func keepRequestTarget(out *http.Request, requestURI string) {
	path, query, hasQuery := strings.Cut(requestURI, "?")
	// The query string as the client sent it, a bare "?" included, instead of
	// Go's cleaned-up copy.
	out.URL.RawQuery = query
	out.URL.ForceQuery = hasQuery && query == ""
	// When Go would write the path differently, send the client's path text
	// instead (Opaque is sent as is). Only for paths starting with
	// a single "/": Go sends an Opaque starting with "//" as a full URL
	// ("//x" becomes "http://x"), and for those Go's own output already
	// matches the client's.
	if strings.HasPrefix(path, "/") && !strings.HasPrefix(path, "//") && out.URL.EscapedPath() != path {
		out.URL.Opaque = path
	}
}

// With Rewrite set, ReverseProxy removes these from the outgoing request before
// Rewrite runs. restoreForwardedHeaders puts back exactly what the client sent.
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
// socket.remoteAddress, rather than Go's form.
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
