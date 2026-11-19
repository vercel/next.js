// switchyard owns `next start`'s public port and forwards every request,
// unchanged, to the Node server on a private loopback port. It makes no
// routing decisions; later stages move work here from Node.
//
// Contract with Node (packages/next/src/server/lib/switchyard.ts):
//
//		switchyard --listen :3000 --upstream 127.0.0.1:51234 \
//		  --idle-timeout-ms 5000 --header-timeout-ms 60000 \
//		  --request-timeout-ms 300000 --upstream-idle-ms 4000
//
//	  - Every flag is required. Node passes every behavior value, read off its
//	    own server, so Switchyard has no defaults of its own.
//	  - Once it listens, it prints `NEXT_SWITCHYARD_READY <port>` on stdout.
//	  - If it can't listen, it prints the error on stderr and exits 1; Node
//	    reports "Failed to start server".
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
	"sync/atomic"
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
	// Switchyard's connections forever, and Node, which only sees complete
	// requests, couldn't time them out.
	headerTimeout time.Duration
	// Node's requestTimeout: how long a client may take to send the whole
	// request, headers and body. Node's own limit doesn't cover Switchyard's
	// side of the connection: a request Go's server answers itself never
	// reaches Node, and Go keeps reading a body Node has stopped waiting for.
	// 0 means no limit, as in Node.
	requestTimeout time.Duration
	// How long Switchyard keeps an idle connection to Node: below Node's
	// keep-alive, so a request never goes out on a connection Node is
	// closing.
	upstreamIdle time.Duration
}

func parseConfig(args []string) (config, error) {
	flags := flag.NewFlagSet("switchyard", flag.ContinueOnError)
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
	// Go reads 0 differently from Node for two of these: an idle timeout of 0
	// falls back to the request timeout, and an IdleConnTimeout of 0 keeps
	// idle connections to Node forever. The launcher never passes either, so
	// refuse them rather than guess. Negative values are always mistakes.
	for _, f := range []struct {
		name     string
		value    int
		positive bool
	}{
		{"idle-timeout-ms", *idleMs, true},
		{"upstream-idle-ms", *upstreamIdleMs, true},
		{"header-timeout-ms", *headerMs, false},
		{"request-timeout-ms", *requestMs, false},
	} {
		if f.value < 0 || (f.positive && f.value == 0) {
			return config{}, fmt.Errorf("--%s can't be %d", f.name, f.value)
		}
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
		fmt.Fprintln(os.Stderr, "switchyard:", err)
		os.Exit(2)
	}

	ln, err := net.Listen("tcp", cfg.listen)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	addr := ln.Addr().(*net.TCPAddr)

	srv := newServer(newProxy(cfg.upstream, addr, cfg.upstreamIdle), cfg.idleTimeout, cfg.headerTimeout, cfg.requestTimeout)

	fmt.Printf("NEXT_SWITCHYARD_READY %d\n", addr.Port)

	stopped := make(chan struct{})
	go func() {
		<-stopRequested()
		// No deadline: like Node's server.close(), wait for every in-flight
		// request, however long it streams. Shutdown doesn't wait for
		// connections taken over for a WebSocket upgrade, so those end when
		// the process exits.
		if err := srv.Shutdown(context.Background()); err != nil {
			fmt.Fprintln(os.Stderr, "switchyard: shutdown:", err)
		}
		close(stopped)
	}()

	if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, "switchyard:", err)
		os.Exit(1)
	}
	<-stopped
}

// newServer is the public server. It times out what Node times out: idle
// keep-alive connections, request headers, and whole requests. Responses
// aren't limited, so long streams aren't cut off, as in Node.
func newServer(handler http.Handler, idleTimeout, headerTimeout, requestTimeout time.Duration) *http.Server {
	return &http.Server{
		Handler:           handler,
		IdleTimeout:       idleTimeout,
		ReadHeaderTimeout: headerTimeout,
		// Reading a request, body included, must finish within Node's
		// requestTimeout. Go clears the deadline when a connection is taken
		// over for a WebSocket upgrade, so those aren't cut off.
		ReadTimeout: requestTimeout,
		// Go's server answers "OPTIONS *" itself by default, reading the body
		// with no deadline and never calling the handler. Forward it to Node
		// instead, as without Switchyard.
		DisableGeneralOptionsHandler: true,
		ErrorLog:                     log.New(os.Stderr, "switchyard: ", 0),
	}
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

// newProxy forwards to Node at upstream. public is the address Switchyard
// listens on; upstreamIdle is how long an idle connection to Node stays
// pooled.
//
// Preserve request targets, application headers and response bodies. Ordinary
// response reason phrases use Go's built-in text. The options below compensate
// for other defaults in Go's server and proxy.
func newProxy(upstream string, public *net.TCPAddr, upstreamIdle time.Duration) http.Handler {
	publicPort := strconv.Itoa(public.Port)
	// The Host Node sees for a request that came without one (HTTP/1.0
	// allows that). Go would otherwise fill in Node's private address, which
	// would end up in request.url and redirects. Without Switchyard, Node
	// falls back to its own hostname, localhost unless one was given.
	publicHost := net.JoinHostPort(public.IP.String(), publicPort)
	if public.IP.IsUnspecified() {
		publicHost = net.JoinHostPort("localhost", publicPort)
	}
	// Go reports an IPv4 client as plain IPv4 (10.0.0.5), but Node, listening
	// on all interfaces, reports it as IPv4-mapped IPv6 (::ffff:10.0.0.5).
	// clientIP uses Node's form when this is set, so Node sees the same
	// X-Forwarded-For value as without Switchyard.
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
			// address instead. For a target in absolute form
			// ("GET http://other.example/p"), Go's server has already replaced
			// the Host header with the target's host, and Node gets the path
			// ("/p") as the target; the client's own Host header can't be
			// recovered here.
			pr.Out.Host = pr.In.Host
			if pr.Out.Host == "" {
				pr.Out.Host = publicHost
			}
			// Go re-escapes some request paths and drops query parameters it
			// can't parse; keepRequestTarget sends the target as the client
			// did, so Node sees the same URL as without Switchyard.
			keepRequestTarget(pr.Out, pr.In.RequestURI)
			// With Rewrite, Go deletes the client's forwarded headers before
			// this function runs; put them back, so Node sees them as before.
			restoreForwardedHeaders(pr.Out.Header, pr.In.Header)
			// Node now sees Switchyard's connection (127.0.0.1 and its private
			// port) instead of the client's, so pass on the client's address
			// and the public port when no proxy in front of us already did.
			setIfMissing(pr.Out.Header, "X-Forwarded-For", clientIP(pr.In.RemoteAddr, mapIPv4))
			setIfMissing(pr.Out.Header, "X-Forwarded-Port", publicPort)
		},
		// By default the proxy only passes response bytes on when Go's write
		// buffer fills or the response ends (except for event streams and
		// responses of unknown length). -1 writes each chunk to the client as
		// soon as Node sends it, as without Switchyard.
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
		// Node can answer before the client has finished sending the request
		// body. If the body hasn't been read cleanly to its end by then, the
		// rest of it is still on the client connection, and Go's server could
		// read those bytes as the next request. Close the connection after
		// such a response instead of reusing it.
		ModifyResponse: func(res *http.Response) error {
			if body, ok := res.Request.Context().Value(requestBodyKey{}).(*requestBody); ok && !body.readToEnd.Load() {
				res.Header.Set("Connection", "close")
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			// When the request was cancelled on the client's side (the client
			// went away, as with a cancelled prefetch, or its upload hit the
			// request timeout), Node logs nothing, so Switchyard doesn't
			// either. The answer below still goes out, so a timed-out upload
			// gets its 502 and its connection closed.
			if !errors.Is(err, context.Canceled) || r.Context().Err() == nil {
				proxyErrorLog.Printf("proxy error: %v", err)
			}
			// If the request had a body, part of it may still be unread (the
			// request timed out mid-upload, or Node went away). In full-duplex
			// mode Go's server keeps the connection open after this answer, and
			// would read the rest of the body as the next request. Closing the
			// connection avoids that, as Go's server does by itself without
			// full-duplex mode.
			if r.ContentLength != 0 {
				w.Header().Set("Connection", "close")
			}
			// When the client's upload hit the request timeout, answer as Node
			// does: 408 Request Timeout. Every other failure is a 502.
			status := http.StatusBadGateway
			if body, ok := r.Context().Value(requestBodyKey{}).(*requestBody); ok && body.timedOut() {
				status = http.StatusRequestTimeout
			}
			w.WriteHeader(status)
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
		// HTTP/2, which Switchyard doesn't serve, so the error is ignored.
		_ = http.NewResponseController(w).EnableFullDuplex()
		if r.ContentLength != 0 && r.Body != nil && r.Body != http.NoBody {
			// Track whether the body is read to its end before Node answers;
			// ModifyResponse closes the connection if it isn't.
			body := newRequestBody(r.Body)
			r = r.WithContext(context.WithValue(r.Context(), requestBodyKey{}, body))
			r.Body = body
		}
		proxy.ServeHTTP(w, r)
	})
}

type requestBodyKey struct{}

// requestBody records how reading the client's request body ended: at a clean
// end (readToEnd), on the request timeout (deadline), or with another error
// such as broken chunked framing. The transport reads the body on its own
// goroutine while ModifyResponse and ErrorHandler check it, hence the atomics.
type requestBody struct {
	io.ReadCloser
	readToEnd atomic.Bool
	deadline  atomic.Bool
	ended     chan struct{} // closed once a read returns any error, io.EOF included
	endOnce   sync.Once
}

func newRequestBody(body io.ReadCloser) *requestBody {
	return &requestBody{
		ReadCloser: body,
		readToEnd:  atomic.Bool{},
		deadline:   atomic.Bool{},
		ended:      make(chan struct{}),
		endOnce:    sync.Once{},
	}
}

func (b *requestBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	if err != nil {
		if err == io.EOF {
			b.readToEnd.Store(true)
		} else if errors.Is(err, os.ErrDeadlineExceeded) {
			b.deadline.Store(true)
		}
		b.endOnce.Do(func() { close(b.ended) })
	}
	return n, err
}

// timedOut reports whether the body read stopped at the request timeout.
// When the timeout fires, Go's server cancels the request before the read
// that hit the deadline has returned here, so the proxy can report the
// cancellation first; waiting a moment for that read keeps the two in order.
// A body that isn't being read never ends, so the wait is bounded.
func (b *requestBody) timedOut() bool {
	select {
	case <-b.ended:
	case <-time.After(50 * time.Millisecond):
	}
	return b.deadline.Load()
}

var proxyErrorLog = log.New(os.Stderr, "switchyard: ", 0)

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
