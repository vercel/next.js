// switchyard owns `next start`'s public port and forwards every request,
// unchanged, to the Node server on a private loopback port. Node also tells
// it the app's route table and its route.go workers (direct.go), so that
// later stages can send those requests to the workers directly.
//
// Contract with Node (packages/next/src/server/lib/switchyard.ts):
//
//		switchyard --listen :3000 --upstream 127.0.0.1:51234 \
//		  --idle-timeout-ms 5000 --header-timeout-ms 60000 \
//		  --request-timeout-ms 300000 --upstream-idle-ms 4000 --max-header-bytes 16384
//
//	  - Every flag is required. Node passes every behavior value, read off its
//	    own server, so Switchyard has no defaults of its own.
//	  - Node passes the connection metadata secret in __NEXT_PRIVATE_SWITCHYARD_TOKEN.
//	  - Once it listens, it prints `NEXT_SWITCHYARD_READY <port>` on stdout.
//	  - If it can't listen, it prints the error on stderr and exits 1; Node
//	    reports "Failed to start server".
//	  - Node writes control messages to stdin, one JSON object per line
//	    (control.go): the route table, then route.go workers as they start
//	    and stop.
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
	"net/http/httptrace"
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
	// Node's effective public header budget, including --max-http-header-size.
	maxHeaderBytes int
}

// net/http adds this read-buffer allowance to Server.MaxHeaderBytes.
const headerReadAllowance = 4096
const connectionHeader = "X-Nextjs-Switchyard-Connection"

func parseConfig(args []string) (config, error) {
	flags := flag.NewFlagSet("switchyard", flag.ContinueOnError)
	listen := flags.String("listen", "", "public address, like :3000 or 127.0.0.1:3000")
	upstream := flags.String("upstream", "", "Node's private address, like 127.0.0.1:51234")
	idleMs := flags.Int("idle-timeout-ms", 0, "how long an idle client connection stays open")
	headerMs := flags.Int("header-timeout-ms", 0, "how long a client may take to send request headers")
	requestMs := flags.Int("request-timeout-ms", 0, "how long a client may take to send a whole request; 0 means no limit")
	upstreamIdleMs := flags.Int("upstream-idle-ms", 0, "how long an idle connection to Node stays pooled")
	maxHeaderBytes := flags.Int("max-header-bytes", 0, "Node's maximum request header size")
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
	// A non-positive MaxHeaderBytes enables Go's 1 MiB default. Refuse budgets
	// smaller than Go can enforce, rather than silently increasing Node's limit.
	if *maxHeaderBytes <= headerReadAllowance {
		return config{}, fmt.Errorf("--max-header-bytes must be greater than %d", headerReadAllowance)
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
		maxHeaderBytes: *maxHeaderBytes,
	}, nil
}

func main() {
	cfg, err := parseConfig(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "switchyard:", err)
		os.Exit(2)
	}
	token := os.Getenv("__NEXT_PRIVATE_SWITCHYARD_TOKEN")
	if token == "" {
		fmt.Fprintln(os.Stderr, "switchyard: missing connection authentication token")
		os.Exit(2)
	}

	ln, err := net.Listen("tcp", cfg.listen)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	addr := ln.Addr().(*net.TCPAddr)

	f := newSwitchyard(newProxy(cfg.upstream, addr, cfg.upstreamIdle, token))
	srv := newServer(f, cfg.idleTimeout, cfg.headerTimeout, cfg.requestTimeout, cfg.maxHeaderBytes)

	fmt.Printf("NEXT_SWITCHYARD_READY %d\n", addr.Port)

	stopped := make(chan struct{})
	go func() {
		<-stopRequested(f.apply)
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
func newServer(handler http.Handler, idleTimeout, headerTimeout, requestTimeout time.Duration, maxHeaderBytes int) *http.Server {
	// Each client connection gets its own connections to Node (see
	// clientUpstream). ConnContext hands the request handler that client's
	// set, and ConnState closes the set's idle connections to Node as soon
	// as the client's connection closes or is taken over for an upgrade.
	var upstreams sync.Map // net.Conn -> *clientUpstream
	return &http.Server{
		Handler: handler,
		ConnContext: func(ctx context.Context, c net.Conn) context.Context {
			upstream := newClientUpstream()
			upstreams.Store(c, upstream)
			return context.WithValue(ctx, clientUpstreamKey{}, upstream)
		},
		ConnState: func(c net.Conn, state http.ConnState) {
			if state != http.StateClosed && state != http.StateHijacked {
				return
			}
			if upstream, ok := upstreams.LoadAndDelete(c); ok {
				if u, ok := upstream.(*clientUpstream); ok {
					u.close()
				}
			}
		},
		IdleTimeout:       idleTimeout,
		ReadHeaderTimeout: headerTimeout,
		MaxHeaderBytes:    maxHeaderBytes - headerReadAllowance,
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

// newProxy forwards to Node at upstream. public is the address Switchyard
// listens on; upstreamIdle is how long an idle connection to Node stays
// pooled.
//
// Preserve request targets, application headers and response bodies. Ordinary
// response reason phrases use Go's built-in text. The options below compensate
// for other defaults in Go's server and proxy.
func newProxy(upstream string, public *net.TCPAddr, upstreamIdle time.Duration, token string) http.Handler {
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
			// Node sees the client's address on the socket it reads the request
			// from (restoreSwitchyardConnection), so a connection to Node must
			// only ever carry one client's requests. Each client connection has
			// its own transport for that (clientTransport); using the client's
			// address as the URL host keeps the shared fallback transport
			// keyed the same way. DialContext below always connects to Node.
			pr.Out.URL.Host = pr.In.RemoteAddr
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
			_, remotePort, _ := net.SplitHostPort(pr.In.RemoteAddr)
			// Always replace caller-supplied metadata, including headers named
			// in Connection. Node authenticates and removes this before routing.
			pr.Out.Header.Set(connectionHeader, token+";"+net.JoinHostPort(clientIP(pr.In.RemoteAddr, mapIPv4), remotePort))
			// Node now sees Switchyard's connection (127.0.0.1 and its private
			// port) instead of the client's, so pass on the client's address
			// and the public port when no proxy in front of us already did.
			setIfMissing(pr.Out.Header, "X-Forwarded-For", clientIP(pr.In.RemoteAddr, mapIPv4))
			setIfMissing(pr.Out.Header, "X-Forwarded-Port", publicPort)
		},
		// Each chunk Node sends must reach the client as soon as it arrives,
		// as without Switchyard: clientWriter flushes after every write.
		// (FlushInterval -1 does that too, but through a timer it starts per
		// response, on another goroutine, which costs more and can send the
		// headers in a write of their own.)
		FlushInterval: 0,
		Transport:     newClientTransport(upstream, upstreamIdle),
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
		proxy.ServeHTTP(&clientWriter{w}, r)
	})
}

// clientWriter is the client's ResponseWriter as the proxy sees it.
type clientWriter struct {
	http.ResponseWriter
}

// WriteHeader puts back the marker that stops Go from guessing a
// Content-Type (see the handler above): the proxy clears the header map after
// each 1xx response it passes on, such as 103 Early Hints.
func (c *clientWriter) WriteHeader(code int) {
	if _, ok := c.Header()["Content-Type"]; !ok && code >= 200 {
		c.Header()["Content-Type"] = nil
	}
	c.ResponseWriter.WriteHeader(code)
}

// Write sends each chunk to the client as soon as Node sends it, as Node's
// pipe does. The headers wait in Go's buffer until then, so they go out with
// the first chunk, and a one-chunk response in a single write.
func (c *clientWriter) Write(p []byte) (int, error) {
	n, err := c.ResponseWriter.Write(p)
	c.Flush()
	return n, err
}

func (c *clientWriter) Flush() {
	if f, ok := c.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (c *clientWriter) Unwrap() http.ResponseWriter { return c.ResponseWriter }

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

// newUpstreamTransport connects to Node at upstream, keeping up to maxIdle
// idle connections for upstreamIdle. When wrap isn't nil, every connection
// the transport opens passes through it.
func newUpstreamTransport(upstream string, upstreamIdle time.Duration, maxIdle int, wrap func(net.Conn) net.Conn) *http.Transport {
	return &http.Transport{
		// Connect to Node directly, never through an HTTP_PROXY. A new
		// Transport already does that (only http.DefaultTransport reads
		// HTTP_PROXY); this says so.
		Proxy: nil,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			conn, err := (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext(ctx, network, upstream)
			if err != nil || wrap == nil {
				return conn, err
			}
			return wrap(conn), nil
		},
		MaxIdleConns:        maxIdle,
		MaxIdleConnsPerHost: maxIdle,
		IdleConnTimeout:     upstreamIdle,
		// When the client sent no Accept-Encoding, Go adds "Accept-Encoding:
		// gzip" to the request to Node and unzips the response itself. This
		// turns that off, so compression stays between the client and Node.
		DisableCompression:    true,
		ExpectContinueTimeout: 1 * time.Second,
	}
}

type clientUpstreamKey struct{}

// maxKeptUpstreams is how many connections to Node may be open at once with
// keep-alive across all clients, as Go's shared pool allowed before
// connections to Node were split per client. A variable so tests can lower
// it.
var maxKeptUpstreams int64 = 512

// keptUpstreams counts the connections to Node that may stay open for reuse
// between requests. A connection takes a slot when it is opened, if one is
// free, and gives it back when it closes (its client left, it sat idle too
// long, or Node closed it) or when it leaves HTTP for an upgrade. A connection
// without a slot is closed as soon as the transport would park it as idle, so
// at most limit connections to Node are ever kept between requests.
type keptUpstreams struct {
	count atomic.Int64
	limit int64
}

func (k *keptUpstreams) take() bool {
	if k.count.Add(1) <= k.limit {
		return true
	}
	k.count.Add(-1)
	return false
}

// keptConn is a connection to Node. slotted reports whether it still holds a
// slot; release gives the slot back once, however often it is called.
type keptConn struct {
	net.Conn
	kept    *keptUpstreams
	once    sync.Once
	slotted atomic.Bool
}

func newKeptConn(conn net.Conn, kept *keptUpstreams) *keptConn {
	c := &keptConn{Conn: conn, kept: kept, once: sync.Once{}, slotted: atomic.Bool{}}
	c.slotted.Store(kept.take())
	return c
}

func (c *keptConn) release() {
	if c.slotted.Load() {
		c.once.Do(func() {
			c.slotted.Store(false)
			c.kept.count.Add(-1)
		})
	}
}

func (c *keptConn) Close() error {
	c.release()
	return c.Conn.Close()
}

// clientUpstream holds one client connection's connections to Node. Go's
// HTTP/1 server handles one request at a time per client connection, so one
// idle connection to Node is enough to reuse between that client's requests.
// When the client's connection closes, close drops it at once instead of
// leaving it idle until IdleConnTimeout, so connections to Node never outlive
// the clients they serve.
type clientUpstream struct {
	mu        sync.Mutex
	transport *http.Transport
}

func newClientUpstream() *clientUpstream {
	return &clientUpstream{mu: sync.Mutex{}, transport: nil}
}

// get returns the client's transport, creating it on first use.
func (u *clientUpstream) get(newTransport func() *http.Transport) *http.Transport {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.transport == nil {
		u.transport = newTransport()
	}
	return u.transport
}

// close drops the client's idle connection to Node, which gives its slot
// back. A connection still serving a response when the client leaves isn't
// idle yet: the client's request context is cancelled then, and the
// transport closes that connection instead of keeping it.
func (u *clientUpstream) close() {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.transport != nil {
		u.transport.CloseIdleConnections()
	}
}

// clientTransport sends each request on its client connection's own
// transport (clientUpstream), or on shared when the request didn't come
// through newServer.
type clientTransport struct {
	shared       *http.Transport
	newTransport func() *http.Transport
}

func newClientTransport(upstream string, upstreamIdle time.Duration) clientTransport {
	kept := &keptUpstreams{count: atomic.Int64{}, limit: maxKeptUpstreams}
	return clientTransport{
		shared: newUpstreamTransport(upstream, upstreamIdle, int(maxKeptUpstreams), nil),
		newTransport: func() *http.Transport {
			return newUpstreamTransport(upstream, upstreamIdle, 1, func(conn net.Conn) net.Conn {
				return newKeptConn(conn, kept)
			})
		},
	}
}

func (t clientTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	u, ok := r.Context().Value(clientUpstreamKey{}).(*clientUpstream)
	if !ok {
		return t.shared.RoundTrip(r)
	}
	transport := u.get(t.newTransport)
	// The connection this request goes out on, and what happens to it after
	// the response: a connection without a slot is closed when the transport
	// parks it as idle, instead of being kept for this client's next request.
	var conn atomic.Pointer[keptConn]
	trace := &httptrace.ClientTrace{
		GotConn: func(info httptrace.GotConnInfo) {
			if c, ok := info.Conn.(*keptConn); ok {
				conn.Store(c)
			}
		},
		PutIdleConn: func(err error) {
			if c := conn.Load(); err == nil && c != nil && !c.slotted.Load() {
				transport.CloseIdleConnections()
			}
		},
	}
	res, err := transport.RoundTrip(r.WithContext(httptrace.WithClientTrace(r.Context(), trace)))
	if err == nil && res.StatusCode == http.StatusSwitchingProtocols {
		// The connection now carries the upgraded protocol, such as a
		// WebSocket, and is never reused for HTTP, so its slot goes back. The
		// connection itself stays open until the tunnel ends.
		if c := conn.Load(); c != nil {
			c.release()
		}
	}
	return res, err
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
