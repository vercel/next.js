//go:build linux || darwin

// The shipped frontend contains no application imports. Its only application input
// is the versioned manifest; private credentials arrive on the parent control pipe.
package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

const protocol = "next-go-plugin/1"
const maxSockets = 1024 // Data sockets: at most 512 downstream and 512 upstream across both loops.
const maxSlow = 128
const exchangeTimeout = 300 * time.Second

const bufferBudget = 256 << 20
const socketReservation = 128 << 10
const streamReservation = 2 << 20

var socketCount atomic.Int64
var bufferBytes atomic.Int64

type pluginSpec struct {
	ID       string `json:"id"`
	File     string `json:"file"`
	Protocol string `json:"protocol"`
}
type manifest struct {
	Version           int          `json:"version"`
	Frontend          string       `json:"frontend"`
	Goos              string       `json:"goos"`
	Goarch            string       `json:"goarch"`
	Plugins           []pluginSpec `json:"plugins"`
	Routes            []route      `json:"routes"`
	BasePath          string       `json:"basePath"`
	TrailingSlash     bool         `json:"trailingSlash"`
	SkipTrailingSlash bool         `json:"skipTrailingSlash"`
	PublicAssets      []string     `json:"publicAssets"`
}
type launchConfig struct {
	Manifest        string   `json:"manifest"`
	Listen          string   `json:"listen"`
	NodePort        int      `json:"nodePort"`
	Token           string   `json:"token"`
	InternalHeaders []string `json:"internalHeaders"`
	TrustedProxies  []string `json:"trustedProxies"`
}
type backendInfo struct {
	Unix  string
	Port  int
	Token string
}
type frontend struct {
	router    *router
	backends  []backendInfo
	internal  map[string]bool
	trusted   []*net.IPNet
	draining  atomic.Bool
	force     atomic.Bool
	drainOnce sync.Once
	activeMu  sync.Mutex
	active    map[*streamConn]bool
	slowCount atomic.Int64
	clients   atomic.Int64
	upstreams atomic.Int64
	idleCount atomic.Int64
	wg        sync.WaitGroup
	transport *http.Transport
	plugins   map[int]map[string]routeHandler
}

func (f *frontend) reserve() bool {
	if socketCount.Add(1) > maxSockets {
		socketCount.Add(-1)
		return false
	}
	if bufferBytes.Add(socketReservation) > bufferBudget {
		bufferBytes.Add(-socketReservation)
		socketCount.Add(-1)
		return false
	}
	return true
}
func (f *frontend) reserveKind(client bool) bool {
	counter := &f.upstreams
	if client {
		counter = &f.clients
	}
	if counter.Add(1) > 512 {
		counter.Add(-1)
		return false
	}
	if !f.reserve() {
		counter.Add(-1)
		return false
	}
	return true
}
func (f *frontend) releaseKind(client bool) {
	if client {
		f.clients.Add(-1)
	} else {
		f.upstreams.Add(-1)
	}
	f.release()
}
func (f *frontend) release()         { socketCount.Add(-1); bufferBytes.Add(-socketReservation) }
func privateHeader(name string) bool { return strings.HasPrefix(strings.ToLower(name), "x-next-go-") }
func (f *frontend) internalHeader(name string) bool {
	return privateHeader(name) || f.internal[strings.ToLower(name)]
}
func secret() string {
	var b [32]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func confined(root, name string) (string, error) {
	if name == "" || filepath.Base(name) != name || name == "." || name == ".." {
		return "", errors.New("invalid plugin name")
	}
	p := filepath.Join(root, name)
	s, e := os.Lstat(p)
	if e != nil {
		return "", e
	}
	if !s.Mode().IsRegular() || !strings.HasSuffix(name, ".so") {
		return "", errors.New("plugin must be a regular .so file")
	}
	return p, nil
}
func startFrontend(c launchConfig) (f *frontend, err error) {
	if c.Token == "" || c.NodePort < 1 || c.NodePort > 65535 {
		return nil, errors.New("invalid private fallback configuration")
	}
	stat, err := os.Stat(c.Manifest)
	if err != nil {
		return nil, err
	}
	if !stat.Mode().IsRegular() || stat.Size() > 16<<20 {
		return nil, errors.New("invalid manifest file")
	}
	raw, err := os.ReadFile(c.Manifest)
	if err != nil {
		return nil, err
	}
	if len(raw) > 16<<20 {
		return nil, errors.New("manifest too large")
	}
	var m manifest
	if err = json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	if m.Version != 3 || len(m.Plugins) == 0 || len(m.Plugins) > 64 || len(m.Routes) > 100000 || m.Goos != runtime.GOOS || m.Goarch != runtime.GOARCH {
		return nil, errors.New("incompatible manifest")
	}
	f = &frontend{internal: map[string]bool{}, backends: []backendInfo{{Port: c.NodePort, Token: c.Token}}, plugins: map[int]map[string]routeHandler{}}
	for _, h := range c.InternalHeaders {
		f.internal[strings.ToLower(h)] = true
	}
	for _, s := range c.TrustedProxies {
		_, network, e := net.ParseCIDR(s)
		if e != nil {
			return nil, e
		}
		f.trusted = append(f.trusted, network)
	}
	ids := map[string]int{}
	startup, cancelStartup := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelStartup()
	for _, spec := range m.Plugins {
		if spec.ID == "" || ids[spec.ID] != 0 || spec.Protocol != protocol {
			return nil, errors.New("invalid plugin registration")
		}
		file, e := confined(filepath.Dir(c.Manifest), spec.File)
		if e != nil {
			return nil, e
		}
		type loaded struct {
			handlers map[string]routeHandler
			err      error
		}
		ready := make(chan loaded, 1)
		go func() { handlers, err := loadPlugin(file); ready <- loaded{handlers, err} }()
		var handlers map[string]routeHandler
		select {
		case result := <-ready:
			if result.err != nil {
				return nil, result.err
			}
			handlers = result.handlers
		case <-startup.Done():
			return nil, errors.New("Go plugin initialization timeout; application startup must complete within ten seconds")
		}
		id := len(f.backends)
		ids[spec.ID] = id
		f.backends = append(f.backends, backendInfo{})
		f.plugins[id] = handlers
	}
	for _, route := range m.Routes {
		id := ids[route.Plugin]
		if route.Plugin != "" && (id == 0 || f.plugins[id][route.Handler] == nil) {
			return nil, errors.New("unregistered plugin handler")
		}
		if route.Plugin == "" && route.Handler != "" {
			return nil, errors.New("handler without plugin")
		}
	}
	f.router, err = newRouter(m, ids)
	if err != nil {
		return nil, err
	}
	f.transport = &http.Transport{Proxy: nil, MaxConnsPerHost: 128, MaxIdleConns: 128, MaxIdleConnsPerHost: 32, IdleConnTimeout: 15 * time.Second, ResponseHeaderTimeout: 30 * time.Second, MaxResponseHeaderBytes: requestLimit, DisableCompression: true, DialContext: f.dial}
	return f, nil
}

type reservedConn struct {
	net.Conn
	once    sync.Once
	release func()
}

// Active complex exchanges need inactivity bounds too; Transport's IdleConnTimeout
// only covers pooled sockets. The exchange context owns the absolute deadline.
type idleUpstream struct{ net.Conn }

func (c idleUpstream) Read(p []byte) (int, error) {
	c.Conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	return c.Conn.Read(p)
}
func (c idleUpstream) Write(p []byte) (int, error) {
	c.Conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	return c.Conn.Write(p)
}

func (c *reservedConn) Close() error { e := c.Conn.Close(); c.once.Do(c.release); return e }
func (f *frontend) dial(ctx context.Context, network, addr string) (net.Conn, error) {
	if !f.reserveKind(false) {
		return nil, errors.New("upstream socket budget")
	}
	for i, b := range f.backends {
		if addr == fmt.Sprintf("backend%d:80", i) {
			d := net.Dialer{Timeout: 5 * time.Second}
			var c net.Conn
			var e error
			if b.Unix != "" {
				c, e = d.DialContext(ctx, "unix", b.Unix)
			} else {
				c, e = d.DialContext(ctx, "tcp", fmt.Sprintf("127.0.0.1:%d", b.Port))
			}
			if e != nil {
				f.releaseKind(false)
				return nil, e
			}
			return &reservedConn{Conn: idleUpstream{c}, release: func() { f.releaseKind(false) }}, nil
		}
	}
	f.releaseKind(false)
	return nil, errors.New("unregistered upstream")
}
func (f *frontend) beginDrain() {
	f.drainOnce.Do(func() {
		f.draining.Store(true)
		if f.transport != nil {
			f.transport.CloseIdleConnections()
		}
		time.AfterFunc(20*time.Second, func() {
			f.force.Store(true)
			f.activeMu.Lock()
			for c := range f.active {
				c.Close()
			}
			f.activeMu.Unlock()
		})
	})
}
func (f *frontend) stop() {
	f.draining.Store(true)
	if f.transport != nil {
		f.transport.CloseIdleConnections()
	}
}

func main() { os.Exit(run()) }
func run() int {
	if len(os.Args) == 2 && os.Args[1] == "--build-info" {
		info, e := frontendBuildInfo()
		if e != nil {
			fmt.Fprintln(os.Stderr, e)
			return 1
		}
		if e = json.NewEncoder(os.Stdout).Encode(info); e != nil {
			return 1
		}
		return 0
	}
	var c launchConfig
	input := bufio.NewReaderSize(os.Stdin, 65536)
	line, e := input.ReadSlice('\n')
	if e != nil || len(line) > 65536 || json.Unmarshal(line, &c) != nil {
		fmt.Fprintln(os.Stderr, "invalid Go frontend launch configuration")
		return 1
	}
	f, e := startFrontend(c)
	if e != nil {
		fmt.Fprintln(os.Stderr, e)
		return 1
	}
	defer f.stop()
	listener, e := net.Listen("tcp", c.Listen)
	if e != nil {
		fmt.Fprintln(os.Stderr, e)
		return 1
	}
	port := listener.Addr().(*net.TCPAddr).Port
	done := make(chan struct{})
	go func() { io.Copy(io.Discard, input); close(done) }()
	var failed atomic.Bool
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	go func() {
		select {
		case <-done:
		case <-signals:
		}
		f.beginDrain()
	}()
	fmt.Fprintf(os.Stdout, "\x1eNEXT_GO_READY:%s:%d\n", c.Token, port)
	if e = serveEvents(listener.(*net.TCPListener), f); e != nil {
		fmt.Fprintln(os.Stderr, e)
		failed.Store(true)
	}
	f.wg.Wait()
	if failed.Load() {
		return 1
	}
	return 0
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
	for _, s := range bytes.Split(h.connection, []byte(",")) {
		s = bytes.TrimSpace(s)
		if len(h.connection) > 0 && len(s) == 0 {
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
func (f *frontend) identity(remote, host string, h http.Header) (string, string, string, error) {
	if len(f.trusted) == 0 {
		return remote, host, "http", nil
	}
	ip := net.ParseIP(remote)
	trusted := false
	for _, n := range f.trusted {
		if n.Contains(ip) {
			trusted = true
		}
	}
	proto := "http"
	chain := remote
	if trusted {
		if values := h.Values("X-Forwarded-For"); len(values) > 0 {
			var addresses []string
			for _, v := range values {
				for _, a := range strings.Split(v, ",") {
					a = strings.TrimSpace(a)
					if net.ParseIP(a) == nil {
						return "", "", "", errors.New("invalid trusted identity")
					}
					addresses = append(addresses, a)
				}
			}
			first := len(addresses) - 1
			for first > 0 {
				ip := net.ParseIP(addresses[first])
				trusted := false
				for _, network := range f.trusted {
					if network.Contains(ip) {
						trusted = true
						break
					}
				}
				if !trusted {
					break
				}
				first--
			}
			chain = strings.Join(append(addresses[first:], remote), ", ")
		}
		if v := h.Values("X-Forwarded-Proto"); len(v) > 0 {
			if len(v) != 1 || (v[0] != "http" && v[0] != "https") {
				return "", "", "", errors.New("invalid forwarded protocol")
			}
			proto = v[0]
		}
		if v := h.Values("X-Forwarded-Host"); len(v) > 0 {
			if len(v) != 1 || !validHost(v[0]) {
				return "", "", "", errors.New("invalid forwarded host")
			}
			host = v[0]
		}
	}
	return chain, host, proto, nil
}
func validHost(s string) bool {
	if s == "" || strings.ContainsAny(s, "/\\@,# \t\r\n") {
		return false
	}
	u, e := neturlHost(s)
	return e == nil && u
}
func (f *frontend) requestHeader(out []byte, h messageHeader, host []byte, remote string, backend int, params []byte) ([]byte, error) {
	var headers http.Header
	if len(f.trusted) > 0 {
		headers = http.Header{}
		for _, v := range h.fields[:h.n] {
			if strings.HasPrefix(strings.ToLower(string(v.name)), "x-forwarded-") {
				headers.Add(string(v.name), string(v.value))
			}
		}
	}
	chain, forwardHost, proto, e := f.identity(remote, string(host), headers)
	if e != nil || !validHost(string(host)) {
		return nil, errors.New("invalid request identity")
	}
	for _, v := range h.fields[:h.n] {
		name := string(v.name)
		if hopHeader(v.name, h.connection) || f.internalHeader(name) || strings.EqualFold(name, "Forwarded") || strings.HasPrefix(strings.ToLower(name), "x-forwarded-") {
			continue
		}
		out = append(out, v.raw...)
	}
	out = fmt.Appendf(out, "X-Forwarded-For: %s\r\nX-Forwarded-Host: %s\r\nX-Forwarded-Proto: %s\r\nX-Next-Go-Upstream-Token: %s\r\n", chain, forwardHost, proto, f.backends[backend].Token)
	if backend != 0 {
		out = fmt.Appendf(out, "X-Next-Go-Metadata: %s\r\nX-Next-Go-Remote: %s\r\n", base64.RawURLEncoding.EncodeToString(params), remote)
	}
	return append(out, '\r', '\n'), nil
}
