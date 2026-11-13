//go:build linux

package main

// Ported from vercel/vercel-internal#2065. The IPC admission and rejection
// logic is gone: next-front has no lifecycle to complete, so every handoff is
// accepted and net/http applies its own limits, as in the default mode.

import (
	"bytes"
	"errors"
	"io"
	"net"
	"os"
	"sync"
	"sync/atomic"
)

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
			l.server.releaseClient()
			c.reserved = false
		}
		return nil, e
	}
	if c.reserved {
		c.reserved = false
		return &reservedConn{Conn: conn, release: l.server.releaseClient}, nil
	}
	return conn, nil
}

// slow moves an exchange the reactor doesn't handle to net/http. With u nil,
// nothing has gone to Node yet and net/http reads the original request bytes.
// With u set, the request has gone out; net/http reads the live response from
// that connection instead of sending the request again.
func (l *eventLoop) slow(c *eventClient, u *eventUpstream) {
	f := l.server
	var prefix []byte
	if u != nil {
		if c.bodyRemaining > 0 {
			// A response handoff replaces the forwarded upload with a bodyless
			// request. Never interpret its unread body as another public request,
			// including fallbacks taken before the reactor can parse the response.
			c.close = true
		}
		if c.upload {
			// Resume the already-forwarded request's response; no body replay.
			h, e := parseHeader(c.request)
			if e != nil {
				l.fail(c, 502)
				return
			}
			prefix = append(prefix, h.line...)
			prefix = append(prefix, '\r', '\n')
			for _, field := range h.fields[:h.n] {
				if !eq(field.name, "Content-Length") && !eq(field.name, "Connection") {
					prefix = append(prefix, field.raw...)
				}
			}
			prefix = append(prefix, "Content-Length: 0\r\n"...)
			if c.close {
				prefix = append(prefix, "Connection: close\r\n"...)
			}
			prefix = append(prefix, '\r', '\n')
		} else {
			prefix = append(prefix, c.request...)
		}
	}
	if !c.upload || c.bodyRemaining == 0 {
		prefix = append(prefix, c.input[:c.used]...)
	}
	var upstream net.Conn
	var initial []byte
	var err error
	if u != nil {
		initial = append([]byte(nil), u.buffer[:u.used]...)
		u.client = nil
		c.up = nil
		upstream, err = l.detach(u.ec)
		if err != nil {
			l.fail(c, 502)
			return
		}
	}
	client, err := l.detach(c.ec)
	if err != nil {
		if upstream != nil {
			upstream.Close()
		}
		return
	}
	f.wg.Add(1)
	go func() {
		defer f.wg.Done()
		defer client.Close()
		if upstream != nil {
			defer upstream.Close()
		}
		f.serveStream(client, prefix, upstream, initial)
	}()
}

type streamConn struct {
	net.Conn
	reader  io.Reader
	readMu  sync.Mutex
	once    sync.Once
	onClose func()
	state   atomic.Int32 // http.ConnState, for draining
}

func (c *streamConn) Read(p []byte) (int, error) {
	c.readMu.Lock()
	defer c.readMu.Unlock()
	return c.reader.Read(p)
}
func (c *streamConn) Close() error {
	var err error
	c.once.Do(func() {
		err = c.Conn.Close()
		if c.onClose != nil {
			c.onClose()
		}
	})
	return err
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

func checkedRequestHeader(raw []byte) (h messageHeader, err error) {
	err = checkedRequestHeaderInto(raw, &h)
	return
}

// checkedRequestHeaderInto accepts only requests whose forwarded form is the
// one newProxy would send: HTTP/1.1, an origin-form target net/http parses,
// and exactly one valid Host.
func checkedRequestHeaderInto(raw []byte, h *messageHeader) error {
	h.reset()
	if len(raw) > requestLimit || !bytes.HasSuffix(raw, []byte("\r\n\r\n")) || bytes.Index(raw, []byte("\r\n\r\n")) != len(raw)-4 {
		return errors.New("incomplete header")
	}
	e := parseHeaderInto(raw, h)
	if e != nil {
		return e
	}
	method, tail, first := bytes.Cut(h.line, []byte(" "))
	target, version, second := bytes.Cut(tail, []byte(" "))
	if !first || !second || len(method) == 0 || string(method) == "CONNECT" || string(version) != "HTTP/1.1" {
		return errors.New("HTTP/1.1 origin form required")
	}
	for _, c := range method {
		if !token(c) {
			return errors.New("invalid method")
		}
	}
	if !validTarget(target) {
		return errors.New("invalid request target")
	}
	hosts := 0
	for _, v := range h.fields[:h.n] {
		if eq(v.name, "Host") {
			hosts++
			h.host = v.value
			if !validHost(v.value) {
				return errors.New("invalid Host")
			}
		}
	}
	if hosts != 1 {
		return errors.New("one Host required")
	}
	return nil
}
