//go:build linux || darwin

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/textproto"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

func neturlHost(host string) (bool, error) {
	for _, c := range []byte(host) {
		if c < 33 || c > 126 {
			return false, errors.New("invalid authority")
		}
	}
	u, e := url.Parse("http://" + host)
	return e == nil && u.Host == host && u.Hostname() != "", e
}
func takeConn(c *eventConn) (net.Conn, error) {
	f := os.NewFile(uintptr(c.fd), "frontend socket")
	conn, e := net.FileConn(f)
	f.Close()
	return conn, e
}
func (l *eventLoop) detach(c *eventConn) (net.Conn, error) {
	l.poll.remove(c.fd)
	delete(l.conns, c.fd)
	c.closed = true
	conn, e := takeConn(c)
	if e != nil {
		if c.reserved {
			l.server.releaseKind(c.client != nil)
			c.reserved = false
		}
		return nil, e
	}
	if c.reserved {
		c.reserved = false
		if c.upstream != nil {
			conn = idleUpstream{conn}
		}
		return &reservedConn{Conn: conn, release: func() { l.server.releaseKind(c.client != nil) }}, nil
	}
	return conn, nil
}
func (l *eventLoop) slow(c *eventClient, u *eventUpstream) {
	f := l.server
	if f.slowCount.Add(1) > maxSlow {
		f.slowCount.Add(-1)
		l.fail(c, 503)
		return
	}
	if bufferBytes.Add(streamReservation) > bufferBudget {
		bufferBytes.Add(-streamReservation)
		f.slowCount.Add(-1)
		l.fail(c, 503)
		return
	}
	var prefix []byte
	if u != nil {
		prefix = append(prefix, c.request...)
	}
	prefix = append(prefix, c.input[:c.used]...)
	var upstream net.Conn
	var initial []byte
	var err error
	if u != nil {
		initial = append([]byte(nil), u.buffer[:u.used]...)
		u.client = nil
		c.up = nil
		upstream, err = l.detach(u.ec)
		if err != nil {
			f.slowCount.Add(-1)
			bufferBytes.Add(-streamReservation)
			l.fail(c, 502)
			return
		}
	}
	client, err := l.detach(c.ec)
	if err != nil {
		if upstream != nil {
			upstream.Close()
		}
		f.slowCount.Add(-1)
		bufferBytes.Add(-streamReservation)
		return
	}
	f.wg.Add(1)
	go func() {
		defer f.wg.Done()
		defer f.slowCount.Add(-1)
		defer bufferBytes.Add(-streamReservation)
		defer client.Close()
		if upstream != nil {
			defer upstream.Close()
		}
		f.serveStream(client, prefix, upstream, initial)
	}()
}

// The reader validates raw request boundaries without rewriting bytes. net/http
// owns HTTP handling directly on the public socket, including body backpressure.
type streamConn struct {
	net.Conn
	reader                               io.Reader
	readMu                               sync.Mutex
	upgrade                              atomic.Int32 // 0 pending, 1 hijacked, 2 declined
	once                                 sync.Once
	onClose                              func()
	deadlineMu                           sync.Mutex
	protocolLimit, readLimit, writeLimit time.Time
}

func (c *streamConn) Read(p []byte) (int, error) {
	c.readMu.Lock()
	defer c.readMu.Unlock()
	return c.reader.Read(p)
}
func (c *streamConn) Close() error {
	c.once.Do(func() {
		c.Conn.Close()
		if c.onClose != nil {
			c.onClose()
		}
	})
	return nil
}
func earlier(a, b time.Time) time.Time {
	if a.IsZero() {
		return b
	}
	if b.IsZero() || a.Before(b) {
		return a
	}
	return b
}

// Preserve net/http's abortPendingRead deadline as well as the protocol bound.
// A background read interrupted for Hijack must not reset that deadline itself.
func (c *streamConn) SetReadDeadline(t time.Time) error {
	c.deadlineMu.Lock()
	defer c.deadlineMu.Unlock()
	c.readLimit = t
	return c.Conn.SetReadDeadline(earlier(t, earlier(c.protocolLimit, time.Now().Add(15*time.Second))))
}
func (c *streamConn) protocolDeadline(t time.Time) {
	c.deadlineMu.Lock()
	c.protocolLimit = t
	c.Conn.SetReadDeadline(earlier(c.readLimit, earlier(t, time.Now().Add(15*time.Second))))
	c.deadlineMu.Unlock()
}

type publicReader struct{ c *streamConn }

func (r publicReader) Read(p []byte) (int, error) {
	r.c.deadlineMu.Lock()
	deadline := earlier(r.c.readLimit, earlier(r.c.protocolLimit, time.Now().Add(15*time.Second)))
	r.c.Conn.SetReadDeadline(deadline)
	r.c.deadlineMu.Unlock()
	return r.c.Conn.Read(p)
}
func (c *streamConn) SetWriteDeadline(t time.Time) error {
	c.deadlineMu.Lock()
	defer c.deadlineMu.Unlock()
	c.writeLimit = t
	return c.Conn.SetWriteDeadline(t)
}
func (c *streamConn) SetDeadline(t time.Time) error {
	c.SetReadDeadline(t)
	return c.SetWriteDeadline(t)
}
func (c *streamConn) Write(p []byte) (int, error) {
	c.deadlineMu.Lock()
	deadline := earlier(c.writeLimit, time.Now().Add(15*time.Second))
	c.deadlineMu.Unlock()
	c.Conn.SetWriteDeadline(deadline)
	return c.Conn.Write(p)
}

type oneListener struct {
	conn      net.Conn
	once      sync.Once
	done      chan struct{}
	closeOnce sync.Once
}

func (l *oneListener) Accept() (net.Conn, error) {
	var c net.Conn
	l.once.Do(func() { c = l.conn })
	if c != nil {
		return c, nil
	}
	<-l.done
	return nil, net.ErrClosed
}
func (l *oneListener) Close() error   { l.closeOnce.Do(func() { close(l.done) }); return nil }
func (l *oneListener) Addr() net.Addr { return l.conn.LocalAddr() }
func peekHeader(r *bufio.Reader) ([]byte, error) {
	for {
		b, e := r.Peek(r.Buffered())
		if i := bytes.Index(b, []byte("\r\n\r\n")); i >= 0 {
			if i+4 > requestLimit {
				return nil, errors.New("header limit")
			}
			return b[:i+4], nil
		}
		if r.Buffered() >= requestLimit {
			return nil, errors.New("header limit")
		}
		_, e = r.Peek(r.Buffered() + 1)
		if e != nil {
			return nil, e
		}
	}
}
func checkedRequest(raw []byte) error {
	_, err := checkedRequestHeader(raw)
	return err
}
func checkedRequestHeader(raw []byte) (messageHeader, error) {
	var h messageHeader
	if len(raw) > requestLimit || !bytes.HasSuffix(raw, []byte("\r\n\r\n")) || bytes.Index(raw, []byte("\r\n\r\n")) != len(raw)-4 {
		return h, errors.New("incomplete header")
	}
	h, e := parseHeader(raw)
	if e != nil {
		return h, e
	}
	parts := bytes.Split(h.line, []byte(" "))
	if len(parts) != 3 || len(parts[0]) == 0 || string(parts[0]) == "CONNECT" || string(parts[2]) != "HTTP/1.1" {
		return h, errors.New("HTTP/1.1 origin form required")
	}
	for _, c := range parts[0] {
		if !token(c) {
			return h, errors.New("invalid method")
		}
	}
	if _, e = validTarget(string(parts[1])); e != nil {
		return h, e
	}
	hosts := 0
	for _, v := range h.fields[:h.n] {
		if eq(v.name, "Host") {
			hosts++
			if !validHost(string(v.value)) {
				return h, errors.New("invalid Host")
			}
		}
	}
	if hosts != 1 {
		return h, errors.New("one Host required")
	}
	return h, nil
}
func (f *frontend) serveStream(conn net.Conn, prefix []byte, upstream net.Conn, initial []byte) {
	c := &streamConn{Conn: conn}
	c.reader = &strictRequests{conn: c, reader: bufio.NewReaderSize(io.MultiReader(bytes.NewReader(prefix), publicReader{c}), requestLimit+4096)}
	f.activeMu.Lock()
	if f.active == nil {
		f.active = map[*streamConn]bool{}
	}
	f.active[c] = true
	f.activeMu.Unlock()
	defer func() { f.activeMu.Lock(); delete(f.active, c); f.activeMu.Unlock() }()
	listener := &oneListener{conn: c, done: make(chan struct{})}
	c.onClose = func() { listener.Close() }
	defer listener.Close()
	defer c.Close()
	var first *bufio.Reader
	if upstream != nil {
		first = bufio.NewReaderSize(io.MultiReader(bytes.NewReader(initial), upstream), requestLimit+4096)
	}
	server := http.Server{MaxHeaderBytes: requestLimit, IdleTimeout: 15 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { f.forward(w, r, c, &first, upstream) })}
	server.ConnState = func(_ net.Conn, state http.ConnState) {
		if state == http.StateIdle && f.draining.Load() {
			c.Close()
		}
		if state == http.StateClosed {
			listener.Close()
		}
	}
	server.Serve(listener)
}
func cleanHeader(h http.Header, internal func(string) bool) {
	connection := []byte(strings.Join(h.Values("Connection"), ","))
	for k := range h {
		if hopHeader([]byte(k), connection) || internal(k) {
			delete(h, k)
		}
	}
}
func copyHeaders(to, from http.Header) {
	for k, values := range from {
		to[k] = append([]string(nil), values...)
	}
}

func (f *frontend) cleanTrailer(h http.Header, connection []byte) {
	for name := range h {
		lower := strings.ToLower(name)
		if f.internalHeader(name) || hopHeader([]byte(name), connection) || lower == "host" || lower == "content-length" || lower == "forwarded" || strings.HasPrefix(lower, "x-forwarded-") {
			delete(h, name)
		}
	}
}

type filteredBody struct {
	io.ReadCloser
	trailer http.Header
	clean   func(http.Header)
}

func (b filteredBody) Read(p []byte) (int, error) {
	n, e := b.ReadCloser.Read(p)
	if e == io.EOF {
		b.clean(b.trailer)
	}
	return n, e
}

type flushWriter struct{ w http.ResponseWriter }

func (f flushWriter) Write(p []byte) (int, error) {
	n, e := f.w.Write(p)
	if e == nil {
		e = http.NewResponseController(f.w).Flush()
	}
	return n, e
}
func (f *frontend) forward(w http.ResponseWriter, r *http.Request, c *streamConn, first **bufio.Reader, upstream net.Conn) {
	if r.Header.Get("Upgrade") != "" {
		defer c.upgrade.CompareAndSwap(0, 2)
	}
	ctx, cancel := context.WithTimeout(r.Context(), exchangeTimeout)
	defer cancel()
	// Bind downstream delivery to this exchange as well as upstream activity.
	// A trickling reader must not keep an already-buffered response alive forever.
	http.NewResponseController(w).SetWriteDeadline(time.Now().Add(exchangeTimeout))
	selected, e := f.resolveRoute(r.RequestURI)
	backend, redirect := selected.backend, selected.redirect
	if e != nil {
		http.Error(w, "Invalid URL", 400)
		return
	}
	if redirect != "" {
		http.Redirect(w, r, redirect, 308)
		return
	}
	remote, _, _ := net.SplitHostPort(r.RemoteAddr)
	chain, host, proto, e := f.identity(remote, r.Host, r.Header)
	if e != nil {
		http.Error(w, "Invalid forwarded identity", 400)
		return
	}
	upgrade := r.Header.Get("Upgrade")
	handlers := f.plugins[backend]
	var out *http.Request
	if handlers != nil {
		out = r.WithContext(ctx)
	} else {
		// The proxy rewrites URL/headers. Native handlers own their incoming
		// request and need no deep copy before header policy is applied.
		out = r.Clone(ctx)
	}
	out.Trailer = r.Trailer
	requestConnection := []byte(strings.Join(r.Header.Values("Connection"), ","))
	f.cleanTrailer(out.Trailer, requestConnection)
	if out.Body != nil {
		out.Body = filteredBody{out.Body, out.Trailer, func(h http.Header) { f.cleanTrailer(h, requestConnection) }}
	}
	cleanHeader(out.Header, f.internalHeader)
	for name := range out.Header {
		if strings.EqualFold(name, "Forwarded") || strings.HasPrefix(strings.ToLower(name), "x-forwarded-") {
			delete(out.Header, name)
		}
	}
	out.Header.Set("X-Forwarded-For", chain)
	out.Header.Set("X-Forwarded-Host", host)
	out.Header.Set("X-Forwarded-Proto", proto)
	if upgrade != "" {
		out.Header.Set("Connection", "Upgrade")
		out.Header.Set("Upgrade", upgrade)
	}
	if handlers != nil {
		handler := handlers[selected.handler]
		if handler == nil {
			http.Error(w, "Unknown native handler", 500)
			return
		}
		native := &pluginWriter{ResponseWriter: w, frontend: f, conn: c, upgrade: upgrade != ""}
		handler(native, out, selected.params)
		native.finish()
		return
	}
	var params []byte
	if backend != 0 {
		params, _ = json.Marshal(struct {
			Handler string              `json:"handler"`
			Params  map[string][]string `json:"params"`
		}{selected.handler, selected.params})
	}
	out.Header.Set("X-Next-Go-Upstream-Token", f.backends[backend].Token)
	if backend != 0 {
		out.Header.Set("X-Next-Go-Metadata", base64.RawURLEncoding.EncodeToString(params))
		out.Header.Set("X-Next-Go-Remote", remote)
	}
	out.URL.Scheme = "http"
	out.URL.Host = fmt.Sprintf("backend%d:80", backend)
	out.RequestURI = ""
	out.Close = false
	var hintMu sync.Mutex
	hintDone := false
	hints := 0
	hint := func(code int, h http.Header) error {
		hintMu.Lock()
		defer hintMu.Unlock()
		if hintDone {
			return nil
		}
		hints++
		if hints > 8 {
			return errors.New("informational response limit")
		}
		cleanHeader(h, f.internalHeader)
		copyHeaders(w.Header(), h)
		w.WriteHeader(code)
		clear(w.Header())
		return nil
	}
	var response *http.Response
	if *first != nil {
		defer upstream.Close()
		headerTimer := time.AfterFunc(30*time.Second, func() { upstream.Close() })
		defer headerTimer.Stop()
		reader := *first
		*first = nil
		stop := context.AfterFunc(ctx, func() { upstream.Close() })
		defer stop()
		for {
			raw, err := peekHeader(reader)
			if err != nil {
				e = err
				break
			}
			if _, _, err = responseHeader(raw); err != nil {
				e = err
				break
			}
			response, e = http.ReadResponse(reader, r)
			if e != nil || response.StatusCode >= 200 {
				break
			}
			if response.StatusCode == 101 {
				e = errors.New("unsolicited upgrade")
				break
			}
			if e = hint(response.StatusCode, response.Header); e != nil {
				break
			}
		}
		headerTimer.Stop()
	} else {
		trace := &httptrace.ClientTrace{Got1xxResponse: func(code int, h textproto.MIMEHeader) error { return hint(code, http.Header(h)) }}
		out = out.WithContext(httptrace.WithClientTrace(ctx, trace))
		response, e = f.transport.RoundTrip(out)
	}
	hintMu.Lock()
	hintDone = true
	hintMu.Unlock()
	if e != nil || response == nil {
		w.Header().Set("Connection", "close")
		http.Error(w, "Bad Gateway", 502)
		return
	}
	defer response.Body.Close()
	if response.StatusCode == 101 {
		if upgrade == "" || !strings.EqualFold(response.Header.Get("Upgrade"), upgrade) {
			http.Error(w, "Invalid upgrade", 502)
			return
		}
		rw, ok := response.Body.(io.ReadWriteCloser)
		if !ok {
			http.Error(w, "Invalid upgrade", 502)
			return
		}
		cleanHeader(response.Header, f.internalHeader)
		response.Header.Set("Connection", "Upgrade")
		response.Header.Set("Upgrade", upgrade)
		copyHeaders(w.Header(), response.Header)
		client, buffer, e := w.(http.Hijacker).Hijack()
		if e != nil {
			return
		}
		defer client.Close()
		defer c.Close()
		fmt.Fprint(buffer, "HTTP/1.1 101 Switching Protocols\r\n")
		response.Header.Write(buffer)
		fmt.Fprint(buffer, "\r\n")
		if buffer.Flush() != nil {
			return
		}
		c.upgrade.Store(1)
		done := make(chan struct{}, 1)
		go func() { io.Copy(rw, buffer); rw.Close(); done <- struct{}{} }()
		io.Copy(client, rw)
		client.Close()
		rw.Close()
		<-done
		return
	}
	responseConnection := []byte(strings.Join(response.Header.Values("Connection"), ","))
	cleanHeader(response.Header, f.internalHeader)
	f.cleanTrailer(response.Trailer, responseConnection)
	copyHeaders(w.Header(), response.Header)
	for name := range response.Trailer {
		if !f.internalHeader(name) && !hopHeader([]byte(name), nil) {
			w.Header().Add("Trailer", name)
		}
	}
	w.WriteHeader(response.StatusCode)
	buf := make([]byte, 32*1024)
	if _, e = io.CopyBuffer(flushWriter{w}, response.Body, buf); e != nil {
		panic(http.ErrAbortHandler)
	}
	f.cleanTrailer(response.Trailer, responseConnection)
	for name, values := range response.Trailer {
		if !f.internalHeader(name) && !hopHeader([]byte(name), nil) {
			w.Header()[http.TrailerPrefix+name] = values
		}
	}
}
