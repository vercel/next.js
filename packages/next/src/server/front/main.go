// next-front owns `next start`'s public port and forwards every request,
// unchanged, to the Node server on a private loopback port. It makes no
// routing decisions; later stages move work here from Node.
//
// Contract with Node (packages/next/src/server/lib/front-server.ts):
//
//		next-front --listen :3000 --upstream 127.0.0.1:51234 \
//		  --idle-timeout-ms 5000 --header-timeout-ms 60000 --upstream-idle-ms 4000
//
//	  - Every flag is required. Node passes every behavior value, read off its
//	    own server, so the front has no defaults of its own.
//	  - Once it listens, it prints `NEXT_FRONT_READY <port>` on stdout.
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
	"syscall"
	"time"
)

// config is the command line. Node sets every field.
type config struct {
	listen   string
	upstream string
	// Client keep-alive: Node's keepAliveTimeout, or --keepAliveTimeout.
	idleTimeout time.Duration
	// Node's headersTimeout. Without it, clients that never finish their
	// headers would hold the front's connections forever, and Node, which
	// only sees complete requests, couldn't time them out. Bodies need no
	// limit here: Node's own requestTimeout applies as the front streams them.
	headerTimeout time.Duration
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
		listen:        *listen,
		upstream:      *upstream,
		idleTimeout:   ms(*idleMs),
		headerTimeout: ms(*headerMs),
		upstreamIdle:  ms(*upstreamIdleMs),
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

	srv := newServer(newProxy(cfg.upstream, addr, cfg.upstreamIdle), cfg.idleTimeout, cfg.headerTimeout)

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

// newServer is the public server. Keep-alive and request headers are the only
// things it times out, so long responses and uploads stream unbounded, as in
// Node.
func newServer(handler http.Handler, idleTimeout, headerTimeout time.Duration) *http.Server {
	return &http.Server{
		Handler:           handler,
		IdleTimeout:       idleTimeout,
		ReadHeaderTimeout: headerTimeout,
		ErrorLog:          log.New(os.Stderr, "next-front: ", 0),
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

// newProxy forwards to Node at upstream. public is the address the front
// listens on; upstreamIdle is how long an idle connection to Node stays
// pooled.
//
// The goal is that Node receives the same request, and the client the same
// response, as without the front. Go's server and proxy change some things on
// their own, so the comments label each line that deals with that:
//
//   - "Undo Go:" Go changes something by default; this puts it back.
//   - "Match Node:" Go and Node format something differently; this uses
//     Node's format.
//   - "Extra hop:" Node would see the front instead of the client; this
//     passes on what the client's connection said.
func newProxy(upstream string, public *net.TCPAddr, upstreamIdle time.Duration) http.Handler {
	publicPort := strconv.Itoa(public.Port)
	// Match Node: Node, listening on all interfaces, reports IPv4 clients as
	// IPv4-mapped IPv6 addresses (::ffff:10.0.0.5); Go reports plain IPv4.
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
			// Undo Go: Go re-escapes some request paths and drops query
			// parameters it can't parse. Send the target as the client did.
			keepRequestTarget(pr.Out, pr.In.RequestURI)
			// Undo Go: with Rewrite, Go deletes the client's forwarded headers
			// before this function runs. Put them back.
			restoreForwardedHeaders(pr.Out.Header, pr.In.Header)
			// Extra hop: Node sees the front's connection (127.0.0.1 and its
			// private port), so pass on the client's address and the public
			// port when no proxy in front of us already did.
			setIfMissing(pr.Out.Header, "X-Forwarded-For", clientIP(pr.In.RemoteAddr, mapIPv4))
			setIfMissing(pr.Out.Header, "X-Forwarded-Port", publicPort)
		},
		// Undo Go: by default the proxy only sends response bytes on when Go's
		// write buffer fills or the response ends, except for event streams
		// and responses of unknown length. Write each chunk to the client as soon as Node sends
		// it, as Node does.
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
			// Undo Go: when the client sent no Accept-Encoding, Go adds
			// "Accept-Encoding: gzip" to the request to Node and unzips the
			// response itself. Leave compression to the client and Node.
			DisableCompression:    true,
			ExpectContinueTimeout: 1 * time.Second,
		},
		// Undo Go: Go writes its own text after the status code (see
		// writeCustomStatusLine).
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
		// Undo Go: Go's server guesses a type from the body ("sniffs") when a
		// response has no Content-Type, and Node never does. Mark
		// Content-Type as present but empty, so a response without one stays
		// without one. When Node sends one, the proxy's copyHeader adds
		// Node's value to this entry before the headers are written.
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

// Undo Go: writeCustomStatusLine sends Node's response itself when its status
// line isn't the one Go's server would write. Node lets apps set any reason phrase
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

// Undo Go: keepRequestTarget makes the outgoing request line carry the
// target exactly as the client sent it. Go writes the request line from the
// URL it parsed, which can differ: it re-escapes some paths (raw "/é" becomes
// "/%C3%A9"), and with Rewrite it drops query parameters it can't parse.
func keepRequestTarget(out *http.Request, requestURI string) {
	path, query, hasQuery := strings.Cut(requestURI, "?")
	// Undo Go: the query string as the client sent it, a bare "?" included.
	out.URL.RawQuery = query
	out.URL.ForceQuery = hasQuery && query == ""
	// Undo Go: when Go would write the path differently, send the client's
	// path text instead (Opaque is sent as is). Only for paths starting with
	// a single "/": Go sends an Opaque starting with "//" as a full URL
	// ("//x" becomes "http://x"), and for those Go's own output already
	// matches the client's.
	if strings.HasPrefix(path, "/") && !strings.HasPrefix(path, "//") && out.URL.EscapedPath() != path {
		out.URL.Opaque = path
	}
}

// Undo Go: with Rewrite set, ReverseProxy removes these from the outgoing
// request before Rewrite runs. Put back exactly what the client sent.
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

// Match Node: clientIP formats the client address the way Node reports
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
