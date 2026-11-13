//go:build linux

package main

// Ported from vercel/vercel-internal#2065.
//
// The reactor owns fixed-length requests and fixed/chunked HTTP/1.1 responses.
// Complex HTTP exchanges move
// to the bounded streaming bridge before any public response bytes are sent.
import (
	"bytes"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
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
	failed          bool
	client          *eventClient
	upstream        *eventUpstream
	last            time.Time
	reserved        bool
}

type eventClient struct {
	bodyRemaining    int64
	upload           bool
	ec               *eventConn
	input            [64 * 1024]byte
	output           [requestLimit + 1024]byte
	used             int
	pending, extra   []byte
	up               *eventUpstream
	head, close      bool
	busy             bool
	responseStarted  bool
	request          []byte
	requestHeaderLen int
	retryable        bool
	remote           string
	// When the current request's headers started arriving (or the
	// connection was accepted), for Node's headersTimeout.
	started time.Time
	served  bool
}

type eventUpstream struct {
	ec                *eventConn
	client            *eventClient
	buffer            [128 * 1024]byte
	used              int
	tx                []byte
	connecting        bool
	parsed            bool
	remaining         int64
	close             bool
	pooled            bool
	reused            bool
	chunked           bool
	chunks            chunkFramer
	interimEnd, hints int
	trailers          []byte
}

type eventLoop struct {
	poll     *poller
	listener int
	server   *frontend
	conns    map[int]*eventConn
	idle     []*eventUpstream

	now       time.Time
	lastSweep time.Time
	draining  bool
	header    messageHeader
}

func serveEvents(listener *net.TCPListener, server *frontend) error {
	f, err := listener.File()
	if err != nil {
		return err
	}
	listener.Close()
	fd := int(f.Fd())
	defer func() { server.detachListener(); f.Close() }()
	if err = syscall.SetNonblock(fd, true); err != nil {
		return err
	}
	server.attachListener(fd)
	count := min(2, runtime.GOMAXPROCS(0))
	results := make(chan error, count)
	for range count {
		p, e := newPoller(fd)
		if e != nil {
			server.beginDrain()
			return e
		}
		l := &eventLoop{poll: p, listener: fd, server: server, conns: make(map[int]*eventConn), now: time.Now()}
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
	// EPOLLERR is reported even when read interest is disabled. Suspend a
	// failed backend while public writes are blocked, then rearm its read
	// when the pending response bytes have drained.
	if c.failed && c.upstream != nil && !c.readOn {
		l.poll.remove(c.fd)
		return
	}
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
		for i, u := range l.idle {
			if u == c.upstream {
				l.idle = append(l.idle[:i], l.idle[i+1:]...)
				break
			}
		}
	}
	// Remove the registration before this descriptor can be reused.
	l.poll.remove(c.fd)
	syscall.Close(c.fd)
	if c.reserved {
		l.server.releaseClient()
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
		u := c.upstream
		client := u.client
		u.client = nil
		client.up = nil
		// An idle backend may close immediately after the acquisition probe.
		// Retry a bodyless safe request once, on a fresh connection, only if
		// this exchange has received no response bytes at all. The outgoing
		// headers are still intact in output until a response is parsed.
		if u.reused && client.retryable && !u.parsed && u.used == 0 && u.hints == 0 && !client.responseStarted && !client.ec.closed {
			client.retryable = false
			fresh, err := l.connect(client)
			if err == nil {
				fresh.tx = client.output[:client.requestHeaderLen]
				if fresh.connecting {
					l.watch(fresh.ec, writeEvent, true)
				} else {
					l.flushUpstream(fresh)
				}
				return
			}
		}
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
				if c.client != nil {
					l.closeConn(c)
					continue
				}
				// A reset can arrive with a queued response. Let reads consume
				// those bytes and the eventual error, respecting downstream
				// backpressure instead of discarding them or retrying early.
				c.failed = true
				l.watch(c, writeEvent, false)
				l.readUpstream(c.upstream)
				if !c.closed && !c.readOn {
					l.poll.remove(c.fd)
				}
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
			l.sweep()
			l.lastSweep = l.now
		}
		if l.server.draining.Load() && len(l.conns) == 0 {
			return nil
		}
	}
}

// sweep applies the timeouts newServer and newUpstreamTransport set: pooled
// connections to Node close after upstreamIdle, idle clients after Node's
// keep-alive, clients still sending headers after headersTimeout. While
// draining, every connection without an exchange in flight closes.
func (l *eventLoop) sweep() {
	f := l.server
	draining := f.draining.Load()
	for _, c := range l.conns {
		if u := c.upstream; u != nil {
			if u.client == nil && (draining || f.upstreamIdle > 0 && l.now.Sub(c.last) > f.upstreamIdle) {
				l.closeConn(c)
			}
			continue
		}
		client := c.client
		if client == nil || client.busy {
			continue
		}
		switch {
		case draining:
			l.closeConn(c)
		case client.used > 0 || !client.served:
			if f.headerTimeout > 0 && l.now.Sub(client.started) > f.headerTimeout {
				l.closeConn(c)
			}
		default:
			if f.idleTimeout > 0 && l.now.Sub(c.last) > f.idleTimeout {
				l.closeConn(c)
			}
		}
	}
}

func configureEventSocket(fd int, tcp bool) {
	syscall.CloseOnExec(fd)
	syscall.SetNonblock(fd, true)
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
		if !l.server.reserveClient() {
			// Over the reactor's budget: serve it with net/http instead.
			l.server.serveOverflow(fd)
			continue
		}
		c := &eventClient{}
		c.remote = l.server.remoteIP(addr)
		c.started = l.now
		c.ec = &eventConn{fd: fd, client: c, last: l.now, reserved: true}
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
				l.slow(c, nil)
			}
			return
		}
		n, err := syscall.Read(c.ec.fd, c.input[c.used:])
		if n > 0 {
			if !c.busy && c.used == 0 && c.served {
				c.started = l.now
			}
			c.used += n
			c.ec.last = l.now
			if !c.busy {
				l.beginRequest(c)
			} else if c.bodyRemaining > 0 && c.up != nil && !c.up.connecting {
				l.flushUpstream(c.up)
			}
			// Level-triggered readiness will report more bytes without a
			// speculative EAGAIN read on every ordinary request.
			return
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

var tokenBytes = func() (table [256]bool) {
	for b := 33; b < 127; b++ {
		table[b] = !strings.ContainsRune("()<>@,;:\\\"/[]?={}\t", rune(b))
	}
	return
}()

func token(b byte) bool { return tokenBytes[b] }

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
	host                          []byte
}

func (h *messageHeader) reset() {
	clear(h.fields[:h.n])
	h.n = 0
	h.line, h.connection, h.host = nil, nil, nil
	h.length = -1
	h.hasLength, h.close, h.unsupported = false, false, false
}

// Value-returning wrappers remain for the bounded bridge and protocol tests.
func parseHeader(b []byte) (h messageHeader, err error) {
	err = parseHeaderInto(b, &h)
	return
}

func parseHeaderInto(b []byte, h *messageHeader) (err error) {
	h.reset()
	i := bytes.Index(b, []byte("\r\n"))
	if i < 0 {
		return errors.New("line")
	}
	h.line = b[:i]
	for _, v := range h.line {
		if v < 32 || v > 126 {
			return errors.New("invalid start line")
		}
	}
	b = b[i+2:]
	for len(b) > 2 {
		i = bytes.Index(b, []byte("\r\n"))
		if i < 1 || h.n == len(h.fields) {
			return errors.New("headers")
		}
		raw := b[:i+2]
		line := b[:i]
		b = b[i+2:]
		colon := bytes.IndexByte(line, ':')
		if colon < 1 {
			return errors.New("field")
		}
		for _, v := range line[:colon] {
			if !token(v) {
				return errors.New("name")
			}
		}
		value := bytes.Trim(line[colon+1:], " \t")
		for _, v := range value {
			if v < 32 && v != '\t' || v == 127 {
				return errors.New("value")
			}
		}
		f := field{line[:colon], value, raw}
		h.fields[h.n] = f
		h.n++
		switch {
		case eq(f.name, "Content-Length"):
			if h.hasLength || len(value) == 0 {
				return errors.New("duplicate/empty length")
			}
			for _, v := range value {
				if v < '0' || v > '9' {
					return errors.New("length")
				}
			}
			h.length, err = strconv.ParseInt(string(value), 10, 64)
			if err != nil {
				return err
			}
			h.hasLength = true
		case eq(f.name, "Transfer-Encoding"), eq(f.name, "Upgrade"), eq(f.name, "Expect"), eq(f.name, "Trailer"):
			h.unsupported = true
		case eq(f.name, "Connection"):
			if h.connection != nil {
				return errors.New("duplicate connection")
			}
			h.connection = value
			for rest, more := value, true; more; {
				var part []byte
				part, rest, more = bytes.Cut(rest, []byte(","))
				if eq(bytes.TrimSpace(part), "close") {
					h.close = true
				}
			}
		}
	}
	if err = validateFraming(h); err != nil {
		return err
	}

	return nil
}

func responseHeader(b []byte) (h messageHeader, status int, err error) {
	status, err = responseHeaderInto(b, &h)
	return
}

func responseHeaderInto(b []byte, h *messageHeader) (int, error) {
	e := parseHeaderInto(b, h)
	if e != nil {
		return 0, e
	}
	version, tail, ok := bytes.Cut(h.line, []byte(" "))
	if !ok || !bytes.Equal(version, []byte("HTTP/1.1")) || len(tail) < 4 || tail[3] != ' ' {
		return 0, errors.New("invalid response line")
	}
	for _, c := range tail[:3] {
		if c < '0' || c > '9' {
			return 0, errors.New("invalid response status")
		}
	}
	status, e := strconv.Atoi(string(tail[:3]))
	if e != nil || status < 100 || status > 599 {
		return 0, errors.New("invalid response status")
	}
	return status, nil
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
		for i, b := range c.input[:c.used] {
			if b == '\n' && (i == 0 || c.input[i-1] != '\r') {
				l.slow(c, nil)
				return
			}
		}
		if c.used >= requestLimit {
			l.slow(c, nil)
		}
		return
	}
	end += 4
	if end > requestLimit {
		l.slow(c, nil)
		return
	}
	// Scratch belongs to this reactor and is used only until headers are
	// copied into connection-owned buffers. Clear slice references on return.
	h := &l.header
	defer h.reset()
	err := checkedRequestHeaderInto(c.input[:end], h)
	if err != nil {
		l.slow(c, nil)
		return
	}
	// checkedRequestHeader already validates method, origin form, version
	// and exactly one Host. Do not run those checks a second time.
	method, _, _ := bytes.Cut(h.line, []byte(" "))
	if h.unsupported {
		l.slow(c, nil)
		return
	}
	// The request line and Host go to Node unchanged.
	out := append(c.output[:0], h.line...)
	out = append(out, '\r', '\n')
	out, err = l.server.requestHeader(out, h, c.remote)
	if err != nil || len(out) > len(c.output) {
		l.slow(c, nil)
		return
	}
	c.request = append(c.request[:0], c.input[:end]...)

	c.bodyRemaining = max(h.length, 0)
	c.upload = h.length > 0
	c.head = bytes.Equal(method, []byte("HEAD"))
	c.requestHeaderLen = len(out)
	c.retryable = !c.upload && (bytes.Equal(method, []byte("GET")) || c.head || bytes.Equal(method, []byte("OPTIONS")) || bytes.Equal(method, []byte("TRACE")))
	c.close = h.close
	c.busy = true
	c.responseStarted = false
	c.used = copy(c.input[:], c.input[end:c.used])
	u, err := l.acquire(c)
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

func (l *eventLoop) acquire(c *eventClient) (*eventUpstream, error) {
	for len(l.idle) > 0 {
		u := l.idle[len(l.idle)-1]
		l.idle = l.idle[:len(l.idle)-1]
		if u.pooled {
			u.pooled = false
			l.server.idleCount.Add(-1)
		}
		if u.ec.closed {
			continue
		}
		// Check that Node hasn't closed a connection that sat idle for a
		// while. Node closes idle connections only after its keep-alive
		// timeout, so one used moments ago is still open, and the check
		// would cost a syscall on nearly every request. While draining,
		// Node may be closing idle connections, so always check.
		if l.now.Sub(u.ec.last) >= l.server.probeAfter || l.server.draining.Load() {
			var probe [1]byte
			_, _, probeError := syscall.Recvfrom(u.ec.fd, probe[:], syscall.MSG_PEEK|syscall.MSG_DONTWAIT)
			if !wouldBlock(probeError) {
				l.closeConn(u.ec)
				continue
			}
		}
		u.client = c
		u.reused = true
		u.parsed = false
		u.interimEnd = 0
		u.hints = 0
		u.chunked = false
		u.chunks.state = 0
		u.chunks.remaining = 0
		u.chunks.used = 0
		u.chunks.trailers = 0
		u.trailers = u.trailers[:0]
		u.remaining = 0
		u.used = 0
		u.close = false
		c.up = u
		return u, nil
	}
	return l.connect(c)
}

// connect always opens a new socket, including the single retry after a
// previously pooled connection fails. A retry never selects another idle entry.
func (l *eventLoop) connect(c *eventClient) (*eventUpstream, error) {
	fd, err := syscall.Socket(l.server.family, syscall.SOCK_STREAM, 0)
	if err != nil {
		return nil, err
	}
	configureEventSocket(fd, l.server.family != syscall.AF_UNIX)
	err = syscall.Connect(fd, l.server.upstreamAddr)
	if err != nil && err != syscall.EINPROGRESS {
		syscall.Close(fd)
		return nil, err
	}
	u := &eventUpstream{client: c, connecting: err == syscall.EINPROGRESS}
	u.ec = &eventConn{fd: fd, upstream: u, last: l.now}
	l.conns[fd] = u.ec
	c.up = u
	l.watch(u.ec, readEvent, true)
	return u, nil
}

func (l *eventLoop) flushUpstream(u *eventUpstream) {
	if u.ec.closed || u.ec.failed {
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
	c := u.client
	if c == nil {
		return
	}
	for work := 0; work < 16; work++ {
		bodyN := min(int64(c.used), c.bodyRemaining)
		body := c.input[:int(bodyN)]
		if len(u.tx) == 0 && len(body) == 0 {
			break
		}
		var n int
		var err error
		if len(u.tx) > 0 {
			n, err = writev(u.ec.fd, u.tx, body)
		} else {
			n, err = syscall.Write(u.ec.fd, body)
		}
		if n > 0 {
			u.ec.last = l.now
			headerN := min(n, len(u.tx))
			u.tx = u.tx[headerN:]
			if bodyN := n - headerN; bodyN > 0 {
				c.bodyRemaining -= int64(bodyN)
				c.used = copy(c.input[:], c.input[bodyN:c.used])
				l.watch(c.ec, readEvent, true)
			}
		}
		if wouldBlock(err) {
			l.watch(u.ec, writeEvent, true)
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
	if len(u.tx) > 0 || c.bodyRemaining > 0 && c.used > 0 {
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
			l.consumeUpstream(u)
			if u.ec.closed || u.client == nil || len(u.client.pending) > 0 {
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
func (l *eventLoop) consumeUpstream(u *eventUpstream) {
	if !u.parsed {
		end := bytes.Index(u.buffer[:u.used], []byte("\r\n\r\n"))
		if end < 0 {
			for i, b := range u.buffer[:u.used] {
				if b == '\n' && (i == 0 || u.buffer[i-1] != '\r') {
					l.slow(u.client, u)
					return
				}
			}
			if u.used >= requestLimit {
				l.slow(u.client, u)
			}
			return
		}
		end += 4
		if end > requestLimit {
			l.slow(u.client, u)
			return
		}
		h := &l.header
		defer h.reset()
		status, e := responseHeaderInto(u.buffer[:end], h)
		if e != nil {
			l.slow(u.client, u)
			return
		}
		chunked := ordinaryChunked(h)
		if status < 200 {
			if status == 101 || h.unsupported || h.hasLength || u.hints >= 8 {
				l.closeConn(u.ec)
				return
			}
			u.hints++
			u.interimEnd = end
			c := u.client
			out := append(c.output[:0], h.line...)
			out = append(out, '\r', '\n')
			for _, field := range h.fields[:h.n] {
				if !hopHeader(field.name, h.connection) {
					out = append(out, field.raw...)
				}
			}
			c.pending = append(out, '\r', '\n')
			c.extra = nil
			l.flushClient(c)
			return
		}
		// Resume complex responses without replaying an uploaded request.
		if u.client.bodyRemaining > 0 {
			u.close = true
			u.client.close = true
		}
		if h.unsupported && !chunked {
			l.slow(u.client, u)
			return
		}
		body := h.length
		if u.client.head || status == 204 || status == 304 {
			body = 0
		}
		if body < 0 && !chunked {
			l.slow(u.client, u)
			return
		}
		u.parsed = true
		u.remaining = body
		u.chunked = chunked && !u.client.head && status != 204 && status != 304
		if u.chunked {
			u.chunks.connection = append(u.chunks.connection[:0], h.connection...)
		}
		u.close = h.close
		// Early final responses must never pool an incompletely uploaded request.
		if u.client.bodyRemaining > 0 {
			u.close = true
			u.client.close = true
		}
		// Like http.Server after Shutdown: finish this response, then close.
		if l.server.draining.Load() {
			u.client.close = true
		}
		available := int64(u.used - end)
		payload := u.buffer[end:u.used]
		if u.chunked {
			var err error
			payload, err = u.acceptChunks(payload)
			if err != nil {
				l.closeConn(u.ec)
				return
			}
		} else if available > u.remaining {
			l.closeConn(u.ec)
			return
		}
		if !u.chunked {
			u.remaining -= available
		}
		c := u.client
		out := c.output[:0]
		out = append(out, h.line...)
		out = append(out, '\r', '\n')
		for _, f := range h.fields[:h.n] {
			if u.chunked && eq(f.name, "Transfer-Encoding") || !hopHeader(f.name, h.connection) {
				out = append(out, f.raw...)
			}
		}
		if c.close {
			out = append(out, []byte("Connection: close\r\n")...)
		}
		out = append(out, '\r', '\n')
		c.pending = out
		c.extra = payload

	} else {
		payload := u.buffer[:u.used]
		if u.chunked {
			var err error
			payload, err = u.acceptChunks(payload)
			if err != nil {
				l.closeConn(u.ec)
				return
			}
		} else if int64(u.used) > u.remaining {
			l.closeConn(u.ec)
			return
		}
		if !u.chunked {
			u.remaining -= int64(u.used)
		}
		u.client.pending = payload
	}
	client := u.client
	l.flushClient(client)
	if client.ec.closed || client.up != u || len(client.pending) > 0 {
		return
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
			// Informational responses do not commit the final response. A
			// subsequent backend failure still needs a final 502, as net/http
			// sends, rather than closing after a successful-looking 103.
			if c.up == nil || c.up.interimEnd == 0 {
				c.responseStarted = true
			}
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
	if u.interimEnd > 0 {
		u.used = copy(u.buffer[:], u.buffer[u.interimEnd:u.used])
		u.interimEnd = 0
		l.watch(u.ec, readEvent, true)
		if u.used > 0 {
			l.consumeUpstream(u)
		}
		return
	}
	u.used = 0
	if !u.parsed || u.remaining != 0 {
		l.watch(u.ec, readEvent, true)
		return
	}
	c.up = nil
	u.client = nil
	c.request = c.request[:0]
	c.busy = false
	c.responseStarted = false
	c.served = true
	c.started = l.now
	if u.close || u.ec.failed || l.server.draining.Load() {
		l.closeConn(u.ec)
	} else if l.server.idleCount.Add(1) <= maxIdleUpstreams {
		u.pooled = true
		l.idle = append(l.idle, u)
		l.watch(u.ec, readEvent, true)
	} else {
		l.server.idleCount.Add(-1)
		l.closeConn(u.ec)
	}
	if c.close {
		l.closeConn(c.ec)
		return
	}
	l.watch(c.ec, readEvent, true)
	if c.used > 0 {
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
	proxyErrorLog.Printf("proxy error: upstream connection failed")
	c.close = true
	c.busy = true
	c.extra = nil
	c.pending = fmt.Appendf(c.output[:0], "HTTP/1.1 %d %s\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", status, http.StatusText(status))
	l.flushClient(c)
}

// serveOverflow hands a freshly accepted connection to net/http.
func (f *frontend) serveOverflow(fd int) {
	file := os.NewFile(uintptr(fd), "client socket")
	conn, err := net.FileConn(file)
	file.Close()
	if err != nil {
		return
	}
	f.wg.Add(1)
	go func() {
		defer f.wg.Done()
		defer conn.Close()
		f.serveStream(conn, nil, nil, nil)
	}()
}
