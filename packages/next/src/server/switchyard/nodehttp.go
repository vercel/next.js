package main

// Node parity: what Node's HTTP server shows the app and sends the client,
// and the request headers it accepts, where Go's server and proxy differ.
// Shared by the paths that answer for Node.

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/textproto"
	"strings"
	"sync/atomic"
)

// The hop-by-hop headers Go's proxy removes from every request and response
// (hopHeaders in net/http/httputil), besides Connection and the headers it
// names, that Node's server passes on: it shows the app every header the
// client sent, and sends the client every header the app set. Not among them:
// Transfer-Encoding and Trailer, which describe a body that Go's Transport
// and server frame themselves.
var hopHeaders = []string{"Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "Proxy-Connection", "Te", "Upgrade"}

// connectionNames returns the header names h's Connection header lists,
// canonicalized as Go's proxy reads them (removeHopByHopHeaders).
func connectionNames(h http.Header) []string {
	var names []string
	for _, field := range h["Connection"] {
		for _, name := range strings.Split(field, ",") {
			if name = textproto.TrimString(name); name != "" {
				names = append(names, textproto.CanonicalMIMEHeaderKey(name))
			}
		}
	}
	return names
}

// restoreHopHeaders copies into out, the request to Node, the hop-by-hop
// headers of in, the client's request: Connection, hopHeaders and the headers
// Connection names. The client's values replace what the proxy set in their
// place: "Te: trailers" for a TE that lists trailers, and "Connection:
// Upgrade" for an upgrade request, whose client value lists upgrade too.
func restoreHopHeaders(out, in http.Header) {
	restore := func(name string) {
		if values, ok := in[name]; ok && name != "Transfer-Encoding" && name != "Trailer" {
			out[name] = values
		}
	}
	restore("Connection")
	for _, name := range hopHeaders {
		restore(name)
	}
	for _, name := range connectionNames(in) {
		restore(name)
	}
}

// keepHopHeaders returns the response headers Go's proxy is about to remove
// and Node passes on to the client: hopHeaders and the headers Connection
// names, but not Connection itself. The caller puts them back once the proxy
// has removed them; Go's server writes each as is.
func keepHopHeaders(h http.Header) http.Header {
	var kept http.Header
	keep := func(name string) {
		values, ok := h[name]
		if !ok || name == "Connection" || name == "Transfer-Encoding" || name == "Trailer" {
			return
		}
		if kept == nil {
			kept = http.Header{}
		}
		kept[name] = values
	}
	for _, name := range hopHeaders {
		keep(name)
	}
	for _, name := range connectionNames(h) {
		keep(name)
	}
	return kept
}

// Node parity: a client may stop sending (shut down its side of the
// connection) right after its request and still read the answer. Node's
// server answers it. Go's server instead cancels the request as soon as it
// reads the end, so the client got a 502. Switchyard keeps the request to
// Node going instead, and Go's server closes the connection after the answer.
//
// Node also ends its side of the socket then, so an answer that isn't ready
// at once is lost; Switchyard still delivers it (README.md). Passing the end
// on to Node would make Switchyard the side that closes its connection to
// Node first, which leaves that connection's loopback port unusable for
// minutes (see keptConn.Close).

// clientListener hands Go's server clientConns.
type clientListener struct{ net.Listener }

func (l clientListener) Accept() (net.Conn, error) {
	conn, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	return &clientConn{Conn: conn, ended: atomic.Bool{}}, nil
}

// clientConn is a client's connection that records when the client has
// stopped sending: a read returns io.EOF. Go's server reads the connection
// in the background while a request runs, and cancels the request when such
// a read fails, after this is recorded.
type clientConn struct {
	net.Conn
	ended atomic.Bool
}

func (c *clientConn) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	if errors.Is(err, io.EOF) {
		c.ended.Store(true)
	}
	return n, err
}

// CloseWrite passes on Go's server's graceful close (closeWriteAndWait),
// which it skips for a connection without one.
func (c *clientConn) CloseWrite() error {
	if cw, ok := c.Conn.(interface{ CloseWrite() error }); ok {
		return cw.CloseWrite()
	}
	return nil
}

// endWithClient makes the Node request in r outlive a client that stops
// sending. Any other end of the client's connection, or of the request, still
// cancels it. The returned func releases the request once the response is
// done.
func endWithClient(r *http.Request) (*http.Request, func()) {
	conn, ok := r.Context().Value(clientConnKey{}).(*clientConn)
	if !ok {
		return r, func() {}
	}
	ctx, cancel := context.WithCancel(context.WithoutCancel(r.Context()))
	stop := context.AfterFunc(r.Context(), func() {
		if !conn.ended.Load() {
			cancel()
		}
	})
	return r.WithContext(ctx), func() {
		stop()
		cancel()
	}
}

type clientConnKey struct{}

// nodeHeaderBytes counts header bytes the way Node's HTTP parser does
// (TrackHeader in Node's src/node_http_parser.cc): the variable part of the
// first line (a request's URL, a response's reason phrase) plus every
// header's name and value, without separators or line endings. Node refuses a
// message once the count reaches its limit (--max-http-header-size).
//
// Go's parser moves two headers out of the header map, so they are passed
// separately: Transfer-Encoding (transferEncoding) and Trailer (the names in
// trailer).
func nodeHeaderBytes(first string, header http.Header, transferEncoding []string, trailer http.Header) int {
	n := len(first)
	for name, values := range header {
		for _, value := range values {
			n += len(name) + len(value)
		}
	}
	if len(transferEncoding) > 0 {
		n += len("Transfer-Encoding") + len(strings.Join(transferEncoding, ", "))
	}
	if len(trailer) > 0 {
		n += len("Trailer") + len(", ")*(len(trailer)-1)
		for name := range trailer {
			n += len(name)
		}
	}
	return n
}

// nodeHeaderLines counts header lines, the unit of Node's limit on how many
// headers it reads (server.maxHeadersCount), with the same two headers passed
// separately as for nodeHeaderBytes.
func nodeHeaderLines(header http.Header, transferEncoding []string, trailer http.Header) int {
	n := 0
	for _, values := range header {
		n += len(values)
	}
	if len(transferEncoding) > 0 {
		n++
	}
	if len(trailer) > 0 {
		n++
	}
	return n
}

// nodeRequestHeaders measures a request's headers as Node would. Go's server
// also takes Host out of the header map (into r.Host).
func nodeRequestHeaders(r *http.Request) (bytes, lines int) {
	bytes = nodeHeaderBytes(r.RequestURI, r.Header, r.TransferEncoding, r.Trailer)
	lines = nodeHeaderLines(r.Header, r.TransferEncoding, r.Trailer)
	if r.Host != "" {
		bytes += len("Host") + len(r.Host)
		lines++
	}
	return bytes, lines
}

// Node's answer to a request whose headers are over its limit, byte for byte
// (requestHeaderFieldsTooLargeResponse in Node's lib/_http_server.js).
const nodeHeaderFieldsTooLarge = "HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n"

// withNodeHeaderLimits refuses, as Node does, a request whose headers reach
// maxBytes by Node's count, before it goes anywhere.
//
// It also refuses a request with more than maxLines header lines. Node reads
// only the first maxLines and drops the rest without an answer. Switchyard
// can't drop the same ones, because Go's parser doesn't keep the order of
// different headers, so it answers the same 431 instead. Node's own limit on
// its connection to Switchyard is set higher, so the headers Switchyard adds
// always reach Node.
func withNodeHeaderLimits(next http.Handler, maxBytes, maxLines int) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if bytes, lines := nodeRequestHeaders(r); bytes >= maxBytes || lines > maxLines {
			refuseHeaderFields(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// refuseHeaderFields writes Node's 431 and closes the connection.
func refuseHeaderFields(w http.ResponseWriter) {
	conn, rw, err := http.NewResponseController(w).Hijack()
	if err != nil {
		w.Header().Set("Connection", "close")
		w.WriteHeader(http.StatusRequestHeaderFieldsTooLarge)
		return
	}
	defer conn.Close()
	rw.WriteString(nodeHeaderFieldsTooLarge)
	rw.Flush()
}
