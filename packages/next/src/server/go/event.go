//go:build linux || darwin

package main

// The reactor owns bodyless HTTP/1.1 forwarding. Complex HTTP exchanges move
// to the bounded streaming bridge before any public response bytes are sent.
import (
	"bytes"
	"errors"
	"fmt"
	"net"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const requestLimit = 32 * 1024

type eventConn struct {
	fd              int
	tag             byte
	readOn, writeOn bool
	closed          bool
	client          *eventClient
	upstream        *eventUpstream
	last            time.Time
	deadline        time.Time
	reserved        bool
}

type eventClient struct {
	ec              *eventConn
	input           [requestLimit]byte
	output          [requestLimit + 1024]byte
	used            int
	pending, extra  []byte
	up              *eventUpstream
	head, close     bool
	busy            bool
	responseStarted bool
	request         []byte
	remote          string
	started         time.Time
	writeDeadline   time.Time
}

type eventUpstream struct {
	ec         *eventConn
	backend    int
	client     *eventClient
	buffer     [65536]byte
	used       int
	tx         []byte
	connecting bool
	parsed     bool
	remaining  int64
	close      bool
	pooled     bool
}

type eventLoop struct {
	poll     *poller
	listener int
	server   *frontend
	backends []backendInfo
	routes   *router
	conns    map[int]*eventConn
	idle     [][]*eventUpstream

	now       time.Time
	lastSweep time.Time
	draining  bool
}

func serveEvents(listener *net.TCPListener, server *frontend) error {
	f, err := listener.File()
	if err != nil {
		return err
	}
	defer f.Close()
	listener.Close()
	fd := int(f.Fd())
	if err = syscall.SetNonblock(fd, true); err != nil {
		return err
	}
	count := min(2, runtime.GOMAXPROCS(0))
	results := make(chan error, count)
	for range count {
		p, e := newPoller(fd)
		if e != nil {
			server.beginDrain()
			return e
		}
		l := &eventLoop{poll: p, listener: fd, server: server, backends: server.backends, routes: server.router, conns: make(map[int]*eventConn), idle: make([][]*eventUpstream, len(server.backends)), now: time.Now()}
		go func() { results <- l.run() }()
	}
	var first error
	for range count {
		if e := <-results; e != nil {
			first = e
			server.beginDrain()
		}
	}
	return first
}

const readEvent int16 = 1
const writeEvent int16 = 2

func (l *eventLoop) watch(c *eventConn, filter int16, enabled bool) {
	p := &c.readOn
	if filter == writeEvent {
		p = &c.writeOn
	}
	if *p == enabled {
		return
	}
	*p = enabled
	if err := l.poll.watch(c.fd, &c.tag, c.readOn, c.writeOn); err != nil {
		l.closeConn(c)
	}
}
func (l *eventLoop) closeConn(c *eventConn) {
	if c == nil || c.closed {
		return
	}
	c.closed = true
	delete(l.conns, c.fd)
	if c.upstream != nil && c.upstream.client == nil {
		if c.upstream.pooled {
			c.upstream.pooled = false
			l.server.idleCount.Add(-1)
		}
		pool := l.idle[c.upstream.backend]
		for i, u := range pool {
			if u == c.upstream {
				l.idle[u.backend] = append(pool[:i], pool[i+1:]...)
				break
			}
		}
	}
	// close() removes this descriptor's kqueue registrations. Do not queue a
	// delete that could later apply to a newly reused file descriptor.
	l.poll.remove(c.fd)
	syscall.Close(c.fd)
	if c.reserved {
		l.server.releaseKind(c.client != nil)
		c.reserved = false
	}
	if c.client != nil {
		client := c.client
		if client.up != nil {
			u := client.up
			client.up = nil
			u.client = nil
			l.closeConn(u.ec)
		}
	} else if c.upstream.client != nil {
		client := c.upstream.client
		c.upstream.client = nil
		client.up = nil
		l.fail(client, 502)
	}
}

func (l *eventLoop) run() error {
	defer l.poll.close()
	defer func() {
		for _, c := range l.conns {
			l.closeConn(c)
		}
	}()
	for {
		events, err := l.poll.wait()
		if err == syscall.EINTR {
			continue
		}
		if err != nil {
			return err
		}
		l.now = time.Now()
		if l.server.draining.Load() && !l.draining {
			l.poll.stopAccept(l.listener)
			l.draining = true
		}
		for _, e := range events {
			if e.fd == l.listener {
				if !l.server.draining.Load() {
					l.accept()
				}
				continue
			}
			c := l.conns[e.fd]
			if c == nil || e.tag != &c.tag {
				continue
			}
			if e.failed {
				l.closeConn(c)
				continue
			}
			if e.read {
				if c.client != nil {
					l.readClient(c.client)
				} else {
					l.readUpstream(c.upstream)
				}
			}
			if e.write && !c.closed {
				if c.client != nil {
					l.flushClient(c.client)
				} else {
					l.flushUpstream(c.upstream)
				}
			}
		}
		if l.now.Sub(l.lastSweep) >= 100*time.Millisecond {
			for _, c := range l.conns {
				if l.now.After(c.deadline) || l.now.Sub(c.last) > 15*time.Second || c.client != nil && len(c.client.pending) > 0 && l.now.After(c.client.writeDeadline) {
					l.closeConn(c)
				}
				if l.server.force.Load() || l.server.draining.Load() && (c.client != nil && !c.client.busy || c.upstream != nil && c.upstream.client == nil) {
					l.closeConn(c)
				}
			}
			l.lastSweep = l.now
		}
		if l.server.draining.Load() && len(l.conns) == 0 {
			return nil
		}
	}
}
func configureEventSocket(fd int, tcp bool) {
	syscall.CloseOnExec(fd)
	syscall.SetNonblock(fd, true)
	suppressSIGPIPE(fd)
	if tcp {
		syscall.SetsockoptInt(fd, syscall.IPPROTO_TCP, syscall.TCP_NODELAY, 1)
	}

}

func (l *eventLoop) accept() {
	for work := 0; work < 64; work++ {
		fd, addr, err := syscall.Accept(l.listener)
		if err == syscall.EAGAIN {
			return
		}
		if err == syscall.EINTR {
			continue
		}
		if err != nil {
			return
		}
		configureEventSocket(fd, true)
		if !l.server.reserveKind(true) {
			syscall.Close(fd)
			continue
		}
		c := &eventClient{}
		c.remote = remoteIP(addr)
		c.started = l.now
		c.ec = &eventConn{fd: fd, client: c, last: l.now, deadline: l.now.Add(5 * time.Second), reserved: true}
		l.conns[fd] = c.ec
		l.watch(c.ec, readEvent, true)
	}
}

func wouldBlock(err error) bool { return err == syscall.EAGAIN || err == syscall.EWOULDBLOCK }

func (l *eventLoop) readClient(c *eventClient) {
	for work := 0; work < 16 && !c.ec.closed; work++ {
		if c.used == len(c.input) {
			if c.busy {
				l.watch(c.ec, readEvent, false)
			} else {
				l.fail(c, 431)
			}
			return
		}
		n, err := syscall.Read(c.ec.fd, c.input[c.used:])
		if n > 0 {
			if c.used == 0 && !c.busy {
				c.ec.deadline = l.now.Add(5 * time.Second)
			}
			c.used += n
			c.ec.last = l.now
			if !c.busy {
				l.beginRequest(c)
			}
		}
		if wouldBlock(err) {
			return
		}
		if err == syscall.EINTR {
			continue
		}
		if err != nil || n == 0 {
			l.closeConn(c.ec)
			return
		}
	}
}

func token(b byte) bool {
	return b > 32 && b < 127 && !strings.ContainsRune("()<>@,;:\\\"/[]?={}\t", rune(b))
}

func eq(b []byte, s string) bool { return bytes.EqualFold(b, []byte(s)) }

type field struct {
	name, value []byte
	raw         []byte
}
type messageHeader struct {
	line                          []byte
	fields                        [128]field
	n                             int
	length                        int64
	hasLength, close, unsupported bool
	connection                    []byte
}

func parseHeader(b []byte) (h messageHeader, err error) {
	h.length = -1
	i := bytes.Index(b, []byte("\r\n"))
	if i < 0 {
		return h, errors.New("line")
	}
	h.line = b[:i]
	for _, v := range h.line {
		if v < 32 || v > 126 {
			return h, errors.New("invalid start line")
		}
	}
	b = b[i+2:]
	for len(b) > 2 {
		i = bytes.Index(b, []byte("\r\n"))
		if i < 1 || h.n == len(h.fields) {
			return h, errors.New("headers")
		}
		raw := b[:i+2]
		line := b[:i]
		b = b[i+2:]
		colon := bytes.IndexByte(line, ':')
		if colon < 1 {
			return h, errors.New("field")
		}
		for _, v := range line[:colon] {
			if !token(v) {
				return h, errors.New("name")
			}
		}
		value := bytes.Trim(line[colon+1:], " \t")
		for _, v := range value {
			if v < 32 && v != '\t' || v == 127 {
				return h, errors.New("value")
			}
		}
		f := field{line[:colon], value, raw}
		h.fields[h.n] = f
		h.n++
		switch {
		case eq(f.name, "Content-Length"):
			if h.hasLength || len(value) == 0 {
				return h, errors.New("duplicate/empty length")
			}
			for _, v := range value {
				if v < '0' || v > '9' {
					return h, errors.New("length")
				}
			}
			h.length, err = strconv.ParseInt(string(value), 10, 64)
			if err != nil {
				return h, err
			}
			h.hasLength = true
		case eq(f.name, "Transfer-Encoding"), eq(f.name, "Upgrade"), eq(f.name, "Expect"), eq(f.name, "Trailer"):
			h.unsupported = true
		case eq(f.name, "Connection"):
			if h.connection != nil {
				return h, errors.New("duplicate connection")
			}
			h.connection = value
			for _, part := range bytes.Split(value, []byte(",")) {
				if eq(bytes.TrimSpace(part), "close") {
					h.close = true
				}
			}
		}
	}
	if err = validateFraming(&h); err != nil {
		return h, err
	}
	for _, name := range []string{"Content-Length", "Transfer-Encoding", "Host"} {
		for _, item := range bytes.Split(h.connection, []byte(",")) {
			if eq(bytes.TrimSpace(item), name) {
				h.unsupported = true
			}
		}
	}
	return h, nil
}

func responseHeader(b []byte) (messageHeader, int, error) {
	h, e := parseHeader(b)
	if e != nil {
		return h, 0, e
	}
	version, tail, ok := bytes.Cut(h.line, []byte(" "))
	if !ok || !bytes.Equal(version, []byte("HTTP/1.1")) || len(tail) < 4 || tail[3] != ' ' {
		return h, 0, errors.New("invalid response line")
	}
	for _, c := range tail[:3] {
		if c < '0' || c > '9' {
			return h, 0, errors.New("invalid response status")
		}
	}
	status, e := strconv.Atoi(string(tail[:3]))
	if e != nil || status < 100 || status > 599 {
		return h, 0, errors.New("invalid response status")
	}
	return h, status, nil
}

func hopHeader(name, connection []byte) bool {
	for _, s := range []string{"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "TE", "Trailer", "Transfer-Encoding", "Upgrade"} {
		if eq(name, s) {
			return true
		}
	}
	for len(connection) > 0 {
		part, rest, found := bytes.Cut(connection, []byte(","))
		if bytes.EqualFold(name, bytes.TrimSpace(part)) {
			return true
		}
		if !found {
			break
		}
		connection = rest
	}
	return false
}

func (l *eventLoop) beginRequest(c *eventClient) {
	end := bytes.Index(c.input[:c.used], []byte("\r\n\r\n"))
	if end < 0 {
		return
	}
	end += 4
	h, err := parseHeader(c.input[:end])
	if err != nil {
		l.fail(c, 400)
		return
	}
	method, tail, ok := bytes.Cut(h.line, []byte(" "))
	if !ok {
		l.fail(c, 400)
		return
	}
	uri, version, ok := bytes.Cut(tail, []byte(" "))
	if !ok || !bytes.Equal(version, []byte("HTTP/1.1")) {
		l.fail(c, 505)
		return
	}
	if len(method) == 0 || len(uri) == 0 || uri[0] != '/' || bytes.ContainsAny(uri, " \t#") {
		l.fail(c, 400)
		return
	}
	for _, b := range method {
		if !token(b) {
			l.fail(c, 400)
			return
		}
	}

	hostCount := 0
	var host []byte
	for _, f := range h.fields[:h.n] {
		if eq(f.name, "Host") {
			hostCount++
			host = f.value
		}
	}
	if hostCount != 1 || len(host) == 0 {
		l.fail(c, 400)
		return
	}
	target, params, redirect, e := l.server.selectRoute(string(uri))
	if e != nil {
		l.fail(c, 400)
		return
	}
	if redirect != "" {
		l.slow(c, nil)
		return
	}
	if checkedRequest(c.input[:end]) != nil {
		l.fail(c, 400)
		return
	}
	if h.unsupported || h.length > 0 {
		l.slow(c, nil)
		return
	}
	endpoint := target

	out := c.output[:0]
	out = append(out, h.line...)
	out = append(out, '\r', '\n')
	out, err = l.server.requestHeader(out, h, host, c.remote, endpoint, params)
	if err != nil || len(out) > len(c.output) {
		l.fail(c, 400)
		return
	}
	c.request = append(c.request[:0], c.input[:end]...)
	c.started = l.now
	c.ec.deadline = l.now.Add(300 * time.Second)

	c.head = bytes.Equal(method, []byte("HEAD"))
	c.close = h.close
	c.busy = true
	c.responseStarted = false
	c.used = copy(c.input[:], c.input[end:c.used])
	u, err := l.acquire(endpoint, c)
	if err != nil {
		l.fail(c, 502)
		return
	}
	u.tx = out
	if u.connecting {
		l.watch(u.ec, writeEvent, true)
		return
	}
	l.flushUpstream(u)
}

func (l *eventLoop) acquire(backend int, c *eventClient) (*eventUpstream, error) {
	pool := l.idle[backend]
	for len(pool) > 0 {
		u := pool[len(pool)-1]
		pool = pool[:len(pool)-1]
		l.idle[backend] = pool
		if u.pooled {
			u.pooled = false
			l.server.idleCount.Add(-1)
		}
		if u.ec.closed {
			continue
		}
		var probe [1]byte
		_, _, probeError := syscall.Recvfrom(u.ec.fd, probe[:], syscall.MSG_PEEK|syscall.MSG_DONTWAIT)
		if !wouldBlock(probeError) {
			l.closeConn(u.ec)
			continue
		}
		u.ec.deadline = l.now.Add(30 * time.Second)
		u.client = c
		u.parsed = false
		u.remaining = 0
		u.used = 0
		u.close = false
		c.up = u
		return u, nil
	}
	if !l.server.reserveKind(false) {
		return nil, errors.New("socket budget")
	}
	owned := true
	defer func() {
		if owned {
			l.server.releaseKind(false)
		}
	}()
	family := syscall.AF_UNIX
	if l.backends[backend].Unix == "" {
		family = syscall.AF_INET
	}
	fd, err := syscall.Socket(family, syscall.SOCK_STREAM, 0)
	if err != nil {
		return nil, err
	}
	configureEventSocket(fd, false)
	if l.backends[backend].Unix != "" {
		err = syscall.Connect(fd, &syscall.SockaddrUnix{Name: l.backends[backend].Unix})
	} else {
		err = syscall.Connect(fd, &syscall.SockaddrInet4{Port: l.backends[backend].Port, Addr: [4]byte{127, 0, 0, 1}})
	}
	if err != nil && err != syscall.EINPROGRESS {
		syscall.Close(fd)
		return nil, err
	}
	owned = false
	u := &eventUpstream{backend: backend, client: c, connecting: err == syscall.EINPROGRESS}
	u.ec = &eventConn{fd: fd, upstream: u, last: l.now, deadline: l.now.Add(30 * time.Second), reserved: true}
	l.conns[fd] = u.ec
	c.up = u
	l.watch(u.ec, readEvent, true)
	return u, nil
}

func (l *eventLoop) flushUpstream(u *eventUpstream) {
	if u.ec.closed {
		return
	}
	if u.connecting {
		errCode, err := syscall.GetsockoptInt(u.ec.fd, syscall.SOL_SOCKET, syscall.SO_ERROR)
		if err != nil || errCode != 0 {
			l.closeConn(u.ec)
			return
		}
		u.connecting = false
	}
	for work := 0; work < 16 && len(u.tx) > 0; work++ {
		n, err := syscall.Write(u.ec.fd, u.tx)
		if n > 0 {
			u.tx = u.tx[n:]
			u.ec.last = l.now
		}
		if wouldBlock(err) {
			l.watch(u.ec, writeEvent, true)
			return
		}
		if err == syscall.EINTR {
			continue
		}
		if err != nil {
			l.closeConn(u.ec)
			return
		}
	}
	if len(u.tx) > 0 {
		l.watch(u.ec, writeEvent, true)
		return
	}
	l.watch(u.ec, writeEvent, false)
}

func (l *eventLoop) readUpstream(u *eventUpstream) {
	for work := 0; work < 16 && !u.ec.closed; work++ {
		if u.client != nil && len(u.client.pending) > 0 {
			return
		}
		n, err := syscall.Read(u.ec.fd, u.buffer[u.used:])
		if n > 0 {
			u.ec.last = l.now
			if u.client == nil {
				l.closeConn(u.ec)
				return
			}
			u.used += n
			if !u.parsed {
				end := bytes.Index(u.buffer[:u.used], []byte("\r\n\r\n"))
				if end < 0 {
					if u.used >= requestLimit {
						l.closeConn(u.ec)
					}
					continue
				}
				end += 4
				if end > requestLimit {
					l.closeConn(u.ec)
					return
				}
				h, status, e := responseHeader(u.buffer[:end])
				if e != nil {
					l.closeConn(u.ec)
					return
				}
				if status < 200 || h.unsupported {
					l.slow(u.client, u)
					return
				}
				body := h.length
				if u.client.head || status == 204 || status == 304 {
					body = 0
				}
				if body < 0 {
					l.slow(u.client, u)
					return
				}
				u.parsed = true
				u.ec.deadline = u.client.started.Add(exchangeTimeout)
				u.remaining = body
				u.close = h.close
				available := int64(u.used - end)
				if available > u.remaining {
					l.closeConn(u.ec)
					return
				}
				u.remaining -= available
				c := u.client
				out := c.output[:0]
				out = append(out, h.line...)
				out = append(out, '\r', '\n')
				for _, f := range h.fields[:h.n] {
					if !hopHeader(f.name, h.connection) && !privateHeader(string(f.name)) {
						out = append(out, f.raw...)
					}
				}
				if c.close {
					out = append(out, []byte("Connection: close\r\n")...)
				}
				out = append(out, '\r', '\n')
				c.pending = out
				c.writeDeadline = l.now.Add(15 * time.Second)
				c.extra = u.buffer[end:u.used]

			} else {
				if int64(u.used) > u.remaining {
					l.closeConn(u.ec)
					return
				}
				u.remaining -= int64(u.used)
				u.client.pending = u.buffer[:u.used]
				u.client.writeDeadline = l.now.Add(15 * time.Second)
			}
			client := u.client
			l.flushClient(client)
			if client.ec.closed || client.up != u || len(client.pending) > 0 {
				return
			}
		}
		if wouldBlock(err) {
			return
		}
		if err == syscall.EINTR {
			continue
		}
		if err != nil || n == 0 {
			l.closeConn(u.ec)
			return
		}
	}
}

func writeBuffers(fd int, a, b []byte) (int, error) { return writev(fd, a, b) }

func (l *eventLoop) flushClient(c *eventClient) {
	if c.ec.closed {
		return
	}
	for work := 0; work < 16 && len(c.pending) > 0; work++ {
		n, err := writeBuffers(c.ec.fd, c.pending, c.extra)
		if n > 0 {
			c.ec.last = l.now
			c.responseStarted = true
			c.writeDeadline = l.now.Add(15 * time.Second)
			if n >= len(c.pending) {
				n -= len(c.pending)
				c.pending = c.extra[n:]
				c.extra = nil
			} else {
				c.pending = c.pending[n:]
			}
		}
		if wouldBlock(err) {
			l.watch(c.ec, writeEvent, true)
			if c.up != nil {
				l.watch(c.up.ec, readEvent, false)
			}
			return
		}
		if err == syscall.EINTR {
			continue
		}
		if err != nil {
			l.closeConn(c.ec)
			return
		}
	}
	if len(c.pending) > 0 {
		l.watch(c.ec, writeEvent, true)
		if c.up != nil {
			l.watch(c.up.ec, readEvent, false)
		}
		return
	}
	l.watch(c.ec, writeEvent, false)
	if c.up == nil {
		if c.close {
			l.closeConn(c.ec)
		}
		return
	}
	u := c.up
	u.used = 0
	if !u.parsed || u.remaining > 0 {
		l.watch(u.ec, readEvent, true)
		return
	}
	c.up = nil
	u.client = nil
	c.ec.deadline = l.now.Add(15 * time.Second)
	c.request = c.request[:0]
	c.busy = false
	c.responseStarted = false
	if u.close {
		l.closeConn(u.ec)
	} else if len(l.idle[u.backend]) < 32 && l.server.idleCount.Add(1) <= 128 {
		u.pooled = true
		u.ec.deadline = l.now.Add(15 * time.Second)
		l.idle[u.backend] = append(l.idle[u.backend], u)
		l.watch(u.ec, readEvent, true)
	} else {
		if len(l.idle[u.backend]) < 32 {
			l.server.idleCount.Add(-1)
		}
		l.closeConn(u.ec)
	}
	if c.close {
		l.closeConn(c.ec)
		return
	}
	l.watch(c.ec, readEvent, true)
	if c.used > 0 {
		c.ec.deadline = l.now.Add(5 * time.Second)
		l.beginRequest(c)
	}
}

func (l *eventLoop) fail(c *eventClient, status int) {
	if c.ec.closed {
		return
	}
	if c.responseStarted {
		l.closeConn(c.ec)
		return
	}
	if c.up != nil {
		u := c.up
		c.up = nil
		u.client = nil
		l.closeConn(u.ec)
	}
	c.close = true
	c.busy = true
	c.extra = nil
	c.writeDeadline = l.now.Add(15 * time.Second)
	c.pending = fmt.Appendf(c.output[:0], "HTTP/1.1 %d Rejected\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", status)
	l.flushClient(c)
}
