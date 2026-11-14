package main

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/textproto"
	"sync"
	"time"
)

// syncTransport sends GET and HEAD requests without a body to Node and reads
// the response on the calling goroutine, over pooled keep-alive connections.
// http.Transport hands every request to a writer goroutine and gets the
// response back from a reader goroutine, one connection each; on a loopback
// hop those handoffs, and the thread wakeups they cause, cost more than the
// HTTP work itself. Request writing and response parsing are still
// net/http's (Request.Write, http.ReadResponse). Every other request (bodies,
// upgrades, other methods) goes to fallback, the regular http.Transport.
type syncTransport struct {
	dial        func(ctx context.Context, network, addr string) (net.Conn, error)
	addr        string
	idleTimeout time.Duration
	maxIdle     int
	fallback    http.RoundTripper

	mu   sync.Mutex
	idle []*syncConn
}

type syncConn struct {
	conn      net.Conn
	br        *bufio.Reader
	bw        *bufio.Writer
	idleSince time.Time
	reused    bool
}

// newSyncTransport dials Node at addr with dial, the function the fallback
// http.Transport uses (which ignores addr for a Unix socket).
func newSyncTransport(dial func(ctx context.Context, network, addr string) (net.Conn, error), addr string, idleTimeout time.Duration, fallback http.RoundTripper) *syncTransport {
	t := &syncTransport{
		dial:        dial,
		addr:        addr,
		idleTimeout: idleTimeout,
		maxIdle:     512,
		fallback:    fallback,
	}
	// Close connections Node has stopped keeping alive, as http.Transport's
	// idle timer does, so they don't sit in CLOSE_WAIT until the next request.
	go func() {
		for range time.Tick(idleTimeout / 2) {
			t.closeExpired()
		}
	}()
	return t
}

func (t *syncTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if (req.Method != http.MethodGet && req.Method != http.MethodHead) ||
		(req.Body != nil && req.Body != http.NoBody) || req.ContentLength != 0 ||
		req.Header.Get("Upgrade") != "" {
		return t.fallback.RoundTrip(req)
	}
	for {
		pc, err := t.get(req.Context())
		if err != nil {
			return nil, err
		}
		res, err := t.roundTrip(pc, req)
		// Node may have closed a pooled connection just as it was taken.
		// Like http.Transport, retry GET and HEAD on a new connection when
		// nothing came back on a reused one.
		if errors.Is(err, errNothingReceived) && pc.reused && req.Context().Err() == nil {
			continue
		}
		return res, err
	}
}

// errNothingReceived marks a failure before Node sent any response byte.
var errNothingReceived = errors.New("connection to Node closed before a response")

func (t *syncTransport) roundTrip(pc *syncConn, req *http.Request) (*http.Response, error) {
	ctx := req.Context()
	// When the client goes away, http.Transport closes the connection to Node,
	// which is how Node learns the request was aborted. Do the same.
	stop := context.AfterFunc(ctx, func() { pc.conn.Close() })
	fail := func(err error) (*http.Response, error) {
		stop()
		pc.conn.Close()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, err
	}
	if err := req.Write(pc.bw); err != nil {
		return fail(errors.Join(errNothingReceived, err))
	}
	if err := pc.bw.Flush(); err != nil {
		return fail(errors.Join(errNothingReceived, err))
	}
	if _, err := pc.br.Peek(1); err != nil {
		return fail(errors.Join(errNothingReceived, err))
	}
	trace := httptrace.ContextClientTrace(ctx)
	for {
		res, err := http.ReadResponse(pc.br, req)
		if err != nil {
			return fail(err)
		}
		// Pass interim responses (103 Early Hints) on as http.Transport does;
		// ReverseProxy forwards them to the client.
		if res.StatusCode >= 100 && res.StatusCode < 200 && res.StatusCode != http.StatusSwitchingProtocols {
			if trace != nil && trace.Got1xxResponse != nil {
				if err := trace.Got1xxResponse(res.StatusCode, textproto.MIMEHeader(res.Header)); err != nil {
					return fail(err)
				}
			}
			continue
		}
		res.Body = &syncBody{ReadCloser: res.Body, t: t, pc: pc, stop: stop, keep: !res.Close && !req.Close}
		return res, nil
	}
}

// syncBody returns the connection to the pool once the body has been read to
// the end, and closes it if the body is closed early.
type syncBody struct {
	io.ReadCloser
	t    *syncTransport
	pc   *syncConn
	stop func() bool
	keep bool
	done bool
}

func (b *syncBody) Read(p []byte) (int, error) {
	if b.done {
		return 0, io.EOF
	}
	n, err := b.ReadCloser.Read(p)
	if err == io.EOF {
		b.finish(true)
	} else if err != nil {
		b.finish(false)
	}
	return n, err
}

func (b *syncBody) Close() error {
	b.finish(false)
	return nil
}

func (b *syncBody) finish(atEOF bool) {
	if b.done {
		return
	}
	b.done = true
	// stop reports false when the client already went away and the
	// connection was closed.
	if b.stop() && atEOF && b.keep {
		b.t.put(b.pc)
		return
	}
	b.pc.conn.Close()
}

func (t *syncTransport) get(ctx context.Context) (*syncConn, error) {
	now := time.Now()
	t.mu.Lock()
	for len(t.idle) > 0 {
		pc := t.idle[len(t.idle)-1]
		t.idle = t.idle[:len(t.idle)-1]
		if now.Sub(pc.idleSince) < t.idleTimeout {
			t.mu.Unlock()
			pc.reused = true
			return pc, nil
		}
		pc.conn.Close()
	}
	t.mu.Unlock()
	conn, err := t.dial(ctx, "tcp", t.addr)
	if err != nil {
		return nil, err
	}
	return &syncConn{conn: conn, br: bufio.NewReader(conn), bw: bufio.NewWriter(conn)}, nil
}

func (t *syncTransport) put(pc *syncConn) {
	pc.idleSince = time.Now()
	t.mu.Lock()
	if len(t.idle) < t.maxIdle {
		t.idle = append(t.idle, pc)
		pc = nil
	}
	t.mu.Unlock()
	if pc != nil {
		pc.conn.Close()
	}
}

func (t *syncTransport) closeExpired() {
	now := time.Now()
	t.mu.Lock()
	kept := t.idle[:0]
	var expired []*syncConn
	for _, pc := range t.idle {
		if now.Sub(pc.idleSince) < t.idleTimeout {
			kept = append(kept, pc)
		} else {
			expired = append(expired, pc)
		}
	}
	clear(t.idle[len(kept):])
	t.idle = kept
	t.mu.Unlock()
	for _, pc := range expired {
		pc.conn.Close()
	}
}
