//go:build linux

package main

// Ported from vercel/vercel-internal#2065 (internals/ipc-proxy/bootstrap).
// next-front differences from the Vercel IPC proxy: no IPC lifecycle, no
// X-Vercel-Internal-* filtering, no service prefix or health check, Host and
// the request target are forwarded unchanged, X-Forwarded-For and
// X-Forwarded-Port are filled only when missing, and Node's keep-alive,
// header and pool-idle timeouts apply. Anything outside the reactor's grammar
// is handed to the same net/http proxy the default mode uses.

import (
	"bytes"
	"errors"
	"net"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

const reactorSupported = true

// Connections beyond these go to the net/http path instead: each reactor
// client and upstream holds fixed buffers (about 100 KiB and 130 KiB).
const maxReactorClients = 512
const maxIdleUpstreams = 512

type frontend struct {
	upstream     string
	upstreamAddr syscall.Sockaddr
	family       int
	public       *net.TCPAddr
	publicPort   []byte
	mapIPv4      bool

	idleTimeout, headerTimeout, upstreamIdle time.Duration
	// Pooled connections idle at least this long are checked before reuse.
	probeAfter time.Duration

	// The compatibility path: the same handler the default mode serves.
	transport *http.Transport
	handler   http.Handler

	listenerMu sync.Mutex
	listenerFD int
	draining   atomic.Bool
	drainOnce  sync.Once
	activeMu   sync.Mutex
	active     map[*streamConn]struct{}
	clients    atomic.Int64
	idleCount  atomic.Int64
	wg         sync.WaitGroup
}

func newFrontend(cfg config, public *net.TCPAddr) (*frontend, error) {
	f := &frontend{
		upstream:      cfg.upstream,
		public:        public,
		publicPort:    []byte(strconv.Itoa(public.Port)),
		mapIPv4:       public.IP.To4() == nil,
		idleTimeout:   cfg.idleTimeout,
		headerTimeout: cfg.headerTimeout,
		upstreamIdle:  cfg.upstreamIdle,
		listenerFD:    -1,
	}
	// Node closes a connection after it has been idle for its keep-alive
	// timeout, and upstreamIdle is a second below that. A connection used
	// within a quarter of upstreamIdle (at most a second) can't be one Node
	// is closing for idleness. Without a pool limit, always check.
	if cfg.upstreamIdle > 0 {
		f.probeAfter = min(time.Second, cfg.upstreamIdle/4)
	}
	if path, ok := unixSocketPath(cfg.upstream); ok {
		f.upstreamAddr, f.family = &syscall.SockaddrUnix{Name: path}, syscall.AF_UNIX
	} else {
		host, portText, err := net.SplitHostPort(cfg.upstream)
		if err != nil {
			return nil, err
		}
		port, err := strconv.Atoi(portText)
		if err != nil {
			return nil, err
		}
		ip := net.ParseIP(host)
		if ip == nil {
			addrs, err := net.LookupIP(host)
			if err != nil || len(addrs) == 0 {
				return nil, errors.New("cannot resolve upstream " + host)
			}
			ip = addrs[0]
		}
		if v4 := ip.To4(); v4 != nil {
			sa := &syscall.SockaddrInet4{Port: port}
			copy(sa.Addr[:], v4)
			f.upstreamAddr, f.family = sa, syscall.AF_INET
		} else {
			sa := &syscall.SockaddrInet6{Port: port}
			copy(sa.Addr[:], ip.To16())
			f.upstreamAddr, f.family = sa, syscall.AF_INET6
		}
	}
	f.transport = newUpstreamTransport(cfg.upstream, cfg.upstreamIdle)
	f.handler = newProxyWithTransport(cfg.upstream, public, f.transport)
	return f, nil
}

func (f *frontend) serve(listener *net.TCPListener) error {
	return serveEvents(listener, f)
}

// beginDrain stops accepting and lets in-flight exchanges finish, like
// http.Server.Shutdown: idle connections close, busy ones close after their
// response.
func (f *frontend) beginDrain() {
	f.drainOnce.Do(func() {
		f.draining.Store(true)
		f.shutdownListener()
		f.transport.CloseIdleConnections()
		f.activeMu.Lock()
		for c := range f.active {
			if http.ConnState(c.state.Load()) == http.StateIdle {
				c.Close()
			}
		}
		f.activeMu.Unlock()
	})
}

// The listening socket is shared by the loops and beginDrain. Once draining
// has begun it stops accepting: the loops drop it from epoll on their next
// wake-up and close it when they exit.
func (f *frontend) attachListener(fd int) {
	f.listenerMu.Lock()
	defer f.listenerMu.Unlock()
	f.listenerFD = fd
	if f.draining.Load() {
		syscall.Shutdown(fd, syscall.SHUT_RD)
	}
}

func (f *frontend) shutdownListener() {
	f.listenerMu.Lock()
	defer f.listenerMu.Unlock()
	if f.listenerFD >= 0 {
		syscall.Shutdown(f.listenerFD, syscall.SHUT_RD)
	}
}

func (f *frontend) detachListener() {
	f.listenerMu.Lock()
	defer f.listenerMu.Unlock()
	f.listenerFD = -1
}

func (f *frontend) reserveClient() bool {
	if f.clients.Add(1) > maxReactorClients {
		f.clients.Add(-1)
		return false
	}
	return true
}
func (f *frontend) releaseClient() { f.clients.Add(-1) }

type reservedConn struct {
	net.Conn
	once    sync.Once
	release func()
}

func (c *reservedConn) Close() error { e := c.Conn.Close(); c.once.Do(c.release); return e }

// requestHeader appends the forwarded header block: the client's fields
// without hop-by-hop ones, then X-Forwarded-For and X-Forwarded-Port only when
// the client sent none, as newProxy's Rewrite does.
func (f *frontend) requestHeader(out []byte, h *messageHeader, remote string) ([]byte, error) {
	haveFor, havePort := false, false
	for _, v := range h.fields[:h.n] {
		// Rewrite restores these from the incoming request even when the
		// client's Connection header lists them.
		if hopHeader(v.name, h.connection) && !forwardedHeader(v.name) {
			if eq(v.name, "Te") {
				return nil, errors.New("Te header needs compatibility handling")
			}
			continue
		}
		if !haveFor && eq(v.name, "X-Forwarded-For") {
			haveFor = true
		}
		if !havePort && eq(v.name, "X-Forwarded-Port") {
			havePort = true
		}
		out = append(out, v.raw...)
	}
	if !haveFor && remote != "" {
		out = append(out, "X-Forwarded-For: "...)
		out = append(out, remote...)
		out = append(out, '\r', '\n')
	}
	if !havePort {
		out = append(out, "X-Forwarded-Port: "...)
		out = append(out, f.publicPort...)
		out = append(out, '\r', '\n')
	}
	return append(out, '\r', '\n'), nil
}

func forwardedHeader(name []byte) bool {
	for _, s := range forwardedHeaders {
		if eq(name, s) {
			return true
		}
	}
	return false
}

func validateFraming(h *messageHeader) error {
	te := 0
	for _, f := range h.fields[:h.n] {
		if eq(f.name, "Transfer-Encoding") {
			te++
			if !eq(f.value, "chunked") {
				return errors.New("unsupported transfer coding")
			}
		}
	}
	if te > 1 || te > 0 && h.hasLength {
		return errors.New("ambiguous framing")
	}
	if len(h.connection) == 0 {
		return nil
	}
	for rest, more := h.connection, true; more; {
		var s []byte
		s, rest, more = bytes.Cut(rest, []byte(","))
		s = bytes.TrimSpace(s)
		if len(s) == 0 {
			return errors.New("empty Connection option")
		}
		for _, c := range s {
			if !token(c) {
				return errors.New("invalid Connection option")
			}
		}
		if eq(s, "Content-Length") || eq(s, "Transfer-Encoding") || eq(s, "Host") {
			return errors.New("framing Connection option")
		}
	}
	return nil
}

// validTarget accepts origin-form targets that net/http's parser accepts and
// that newProxy forwards byte for byte. Everything else (non-ASCII bytes,
// "//" prefixes, fragments) takes the net/http path, which already handles it.
func validTarget(target []byte) bool {
	if len(target) == 0 || target[0] != '/' || len(target) > 1 && target[1] == '/' {
		return false
	}
	inPath := true
	for i := 0; i < len(target); i++ {
		b := target[i]
		if b < 33 || b > 126 || b == '#' {
			return false
		}
		if b == '?' {
			inPath = false
		}
		// url.ParseRequestURI rejects only malformed escapes in the path.
		if inPath && b == '%' {
			if i+2 >= len(target) || !isHex(target[i+1]) || !isHex(target[i+2]) {
				return false
			}
		}
	}
	return true
}

func isHex(b byte) bool { return b >= '0' && b <= '9' || b >= 'a' && b <= 'f' || b >= 'A' && b <= 'F' }

// validHost is httpguts.ValidHostHeader for a non-empty value.
func validHost(s []byte) bool {
	if len(s) == 0 {
		return false
	}
	for _, b := range s {
		if b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' {
			continue
		}
		switch b {
		case '!', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', ':', ';', '=', '[', ']', '_', '~':
			continue
		}
		return false
	}
	return true
}

// remoteIP formats the client address as clientIP does.
func (f *frontend) remoteIP(a syscall.Sockaddr) string {
	var ip net.IP
	switch a := a.(type) {
	case *syscall.SockaddrInet4:
		ip = net.IP(a.Addr[:])
	case *syscall.SockaddrInet6:
		ip = net.IP(a.Addr[:])
	default:
		return ""
	}
	if v4 := ip.To4(); v4 != nil && f.mapIPv4 {
		return "::ffff:" + v4.String()
	}
	return ip.String()
}
