//go:build linux

package main

// Ported from vercel/vercel-internal#2065. The trailer and private-header
// filtering is gone; the handoff serves the same handler as the default mode.

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/textproto"
	"sync"
)

// The reactor is an optimization, not a second HTTP compatibility contract.
// Requests outside its grammar transfer their original bytes to net/http.
// An exchange already sent upstream transfers the live response instead of
// sending the request again (which could repeat an application side effect).
func (f *frontend) serveStream(conn net.Conn, prefix []byte, upstream net.Conn, initial []byte) {
	c := &streamConn{Conn: conn, reader: io.MultiReader(bytes.NewReader(prefix), conn)}
	c.state.Store(int32(http.StateNew))
	f.activeMu.Lock()
	if f.active == nil {
		f.active = make(map[*streamConn]struct{})
	}
	f.active[c] = struct{}{}
	f.activeMu.Unlock()
	defer func() { f.activeMu.Lock(); delete(f.active, c); f.activeMu.Unlock() }()
	listener := &oneListener{conn: c, done: make(chan struct{})}
	c.onClose = func() { listener.Close() }
	defer listener.Close()
	defer c.Close()
	handler := f.handler
	if upstream != nil {
		transport := &resumeTransport{
			conn:   upstream,
			reader: bufio.NewReader(io.MultiReader(bytes.NewReader(initial), upstream)),
			base:   f.transport,
		}
		handler = newProxyWithTransport(f.upstream, f.public, transport)
	}
	server := newServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handler.ServeHTTP(&bufferedUpgradeWriter{ResponseWriter: w}, r)
	}), f.idleTimeout, f.headerTimeout)
	server.ConnState = func(_ net.Conn, state http.ConnState) {
		c.state.Store(int32(state))
		if state == http.StateClosed {
			listener.Close()
		}
		if state == http.StateIdle && f.draining.Load() {
			c.Close()
		}
	}
	server.Serve(listener)
}

// Go's ReverseProxy copies upgraded bytes from the hijacked connection,
// rather than its buffered reader. Keep already-read client bytes in that path
// too, so data sent alongside the HTTP handshake is not lost.
type bufferedUpgradeWriter struct{ http.ResponseWriter }

func (w *bufferedUpgradeWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *bufferedUpgradeWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	conn, buffer, err := http.NewResponseController(w.ResponseWriter).Hijack()
	if err != nil {
		return conn, buffer, err
	}
	return &upgradeConn{Conn: conn, reader: buffer.Reader}, buffer, nil
}

type upgradeConn struct {
	net.Conn
	reader io.Reader
}

func (c *upgradeConn) Read(p []byte) (int, error) { return c.reader.Read(p) }

type resumeTransport struct {
	mu     sync.Mutex
	conn   net.Conn
	reader *bufio.Reader
	base   http.RoundTripper
}

func (t *resumeTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	t.mu.Lock()
	reader, conn := t.reader, t.conn
	t.reader = nil
	t.mu.Unlock()
	if reader == nil {
		return t.base.RoundTrip(r)
	}
	stop := context.AfterFunc(r.Context(), func() { conn.Close() })
	for {
		// Match Transport's default response-header limit while allowing larger
		// headers and field counts than fit the reactor's reusable scratch space.
		var header []byte
		lineStart := 0
		for {
			line, err := reader.ReadSlice('\n')
			header = append(header, line...)
			if len(header) > 10<<20 {
				stop()
				conn.Close()
				return nil, errors.New("response headers exceeded 10 MiB")
			}
			if err == bufio.ErrBufferFull {
				continue
			}
			if err != nil {
				stop()
				conn.Close()
				return nil, err
			}
			if bytes.Equal(header[lineStart:], []byte("\r\n")) || bytes.Equal(header[lineStart:], []byte("\n")) {
				break
			}
			lineStart = len(header)
		}
		reader = bufio.NewReader(io.MultiReader(bytes.NewReader(header), reader))
		response, err := http.ReadResponse(reader, r)
		if err != nil {
			stop()
			conn.Close()
			return nil, err
		}
		if response.StatusCode < 200 && response.StatusCode != http.StatusSwitchingProtocols {
			if trace := httptrace.ContextClientTrace(r.Context()); trace != nil && trace.Got1xxResponse != nil {
				if err := trace.Got1xxResponse(response.StatusCode, textproto.MIMEHeader(response.Header)); err != nil {
					stop()
					conn.Close()
					return nil, err
				}
			}
			continue
		}
		response.Body = &resumedBody{ReadCloser: response.Body, conn: conn, stop: stop}
		return response, nil
	}
}

type resumedBody struct {
	io.ReadCloser
	conn net.Conn
	stop func() bool
}

func (b *resumedBody) Close() error {
	b.stop()
	b.conn.Close()
	return b.ReadCloser.Close()
}
