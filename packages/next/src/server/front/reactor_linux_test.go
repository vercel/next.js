//go:build linux

package main

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type reactorFixture struct {
	addr      string
	seen      chan received
	front     *frontend
	done      chan error
	upstreams atomic.Int64 // connections Node (the stub) accepted
}

// startReactor is startProxy for the reactor.
func startReactor(t *testing.T, handler http.HandlerFunc, tweak ...func(*config)) *reactorFixture {
	t.Helper()
	fx := &reactorFixture{seen: make(chan received, 64), done: make(chan error, 1)}
	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case fx.seen <- received{requestURI: r.RequestURI, host: r.Host, header: r.Header.Clone()}:
		default:
		}
		if handler != nil {
			handler(w, r)
		}
	}))
	upstream.Config.ConnState = func(_ net.Conn, s http.ConnState) {
		if s == http.StateNew {
			fx.upstreams.Add(1)
		}
	}
	upstream.Start()
	t.Cleanup(upstream.Close)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config{upstream: upstream.Listener.Addr().String(), idleTimeout: 5 * time.Second, headerTimeout: 5 * time.Second, upstreamIdle: 4 * time.Second}
	for _, f := range tweak {
		f(&cfg)
	}
	f, err := newFrontend(cfg, ln.Addr().(*net.TCPAddr))
	if err != nil {
		t.Fatal(err)
	}
	fx.front = f
	fx.addr = ln.Addr().String()
	go func() { fx.done <- f.serve(ln.(*net.TCPListener)) }()
	t.Cleanup(func() {
		f.beginDrain()
		select {
		case <-fx.done:
		case <-time.After(5 * time.Second):
			t.Error("reactor did not drain")
		}
	})
	return fx
}

func dial(t *testing.T, addr string) (net.Conn, *bufio.Reader) {
	t.Helper()
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	conn.SetDeadline(time.Now().Add(10 * time.Second))
	return conn, bufio.NewReader(conn)
}

func readBody(t *testing.T, r *bufio.Reader) (*http.Response, string) {
	t.Helper()
	res, err := http.ReadResponse(r, nil)
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res, string(body)
}

func keepAliveGet(target string, headers ...string) string {
	return fmt.Sprintf("GET %s HTTP/1.1\r\nHost: shop.example.com\r\n%s\r\n", target, strings.Join(headers, ""))
}

func TestReactorForwardsTheRequestTargetByteForByte(t *testing.T) {
	fx := startReactor(t, nil)
	for _, target := range []string{"/", "/a%2Fb", "/a%252Fb", "//x", "/a/../b", "/é", "/%C3%A9", "/a?q=%2F&r=a+b", "/a?", "/a?x=é", "/a;b=c"} {
		t.Run(target, func(t *testing.T) {
			rawRoundTrip(t, fx.addr, get(target))
			if got := (<-fx.seen).requestURI; got != target {
				t.Errorf("upstream got %q, want %q", got, target)
			}
		})
	}
}

func TestReactorKeepsHostAndForwardedHeaders(t *testing.T) {
	fx := startReactor(t, nil)
	rawRoundTrip(t, fx.addr, get("/",
		"X-Forwarded-For: 203.0.113.7, 198.51.100.2\r\n",
		"X-Forwarded-Host: shop.example.com\r\n",
		"X-Forwarded-Proto: https\r\n",
		"X-Forwarded-Port: 443\r\n",
		"Forwarded: for=203.0.113.7;proto=https\r\n",
	))
	r := <-fx.seen
	if r.host != "shop.example.com" {
		t.Errorf("Host = %q", r.host)
	}
	want := map[string]string{
		"X-Forwarded-For":   "203.0.113.7, 198.51.100.2",
		"X-Forwarded-Host":  "shop.example.com",
		"X-Forwarded-Proto": "https",
		"X-Forwarded-Port":  "443",
		"Forwarded":         "for=203.0.113.7;proto=https",
	}
	for name, value := range want {
		if got := strings.Join(r.header.Values(name), ", "); got != value {
			t.Errorf("%s = %q, want %q", name, got, value)
		}
	}
}

func TestReactorFillsOnlyForAndPortWhenMissing(t *testing.T) {
	fx := startReactor(t, nil)
	rawRoundTrip(t, fx.addr, get("/"))
	header := (<-fx.seen).header
	_, port, _ := net.SplitHostPort(fx.addr)
	if got := header.Get("X-Forwarded-For"); got != "127.0.0.1" {
		t.Errorf("X-Forwarded-For = %q", got)
	}
	if got := header.Get("X-Forwarded-Port"); got != port {
		t.Errorf("X-Forwarded-Port = %q, want %q", got, port)
	}
	for _, name := range []string{"X-Forwarded-Host", "X-Forwarded-Proto", "Forwarded", "User-Agent", "Accept-Encoding", "Connection"} {
		if values, ok := header[name]; ok {
			t.Errorf("%s = %q, want none", name, values)
		}
	}
}

func TestReactorAddsNoContentTypeAndKeepsEverySetCookie(t *testing.T) {
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header()["Content-Type"] = nil
		w.Header().Add("Set-Cookie", "a=1")
		w.Header().Add("Set-Cookie", "b=2")
		io.WriteString(w, "<html>looks like HTML</html>")
	})
	res := rawRoundTrip(t, fx.addr, get("/"))
	if values, ok := res.Header["Content-Type"]; ok {
		t.Errorf("Content-Type = %q, want none", values)
	}
	if got := res.Header.Values("Set-Cookie"); strings.Join(got, "|") != "a=1|b=2" {
		t.Errorf("Set-Cookie = %q", got)
	}
}

// The reactor writes Node's status line itself, so custom reason phrases keep
// the connection alive (the net/http path closes it).
func TestReactorKeepsNodesStatusLineAndTheConnection(t *testing.T) {
	statuses := []string{"400 Invalid JSON", "413 Payload Too Large", "416 Range Not Satisfiable", "200 OK"}
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) {
		conn, buf, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		fmt.Fprintf(buf, "HTTP/1.1 %s\r\nContent-Length: 5\r\nX-Kept: yes\r\n\r\nhello", r.URL.Query().Get("s"))
		buf.Flush()
	})
	conn, reader := dial(t, fx.addr)
	for _, status := range statuses {
		io.WriteString(conn, keepAliveGet("/?s="+strings.ReplaceAll(status, " ", "+")))
		res, body := readBody(t, reader)
		if res.Status != status || body != "hello" || res.Header.Get("X-Kept") != "yes" || res.Close {
			t.Errorf("got %q %q %q close=%v, want %q hello yes on a kept connection", res.Status, body, res.Header.Get("X-Kept"), res.Close, status)
		}
	}
}

func TestReactorReusesOneUpstreamConnection(t *testing.T) {
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") })
	conn, reader := dial(t, fx.addr)
	for i := 0; i < 50; i++ {
		io.WriteString(conn, keepAliveGet("/"))
		if _, body := readBody(t, reader); body != "ok" {
			t.Fatalf("body %q", body)
		}
	}
	if n := fx.upstreams.Load(); n != 1 {
		t.Errorf("Node accepted %d connections for 50 sequential requests, want 1", n)
	}
}

func TestReactorPipelinedRequests(t *testing.T) {
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, r.URL.Path) })
	conn, reader := dial(t, fx.addr)
	io.WriteString(conn, keepAliveGet("/one")+keepAliveGet("/two")+keepAliveGet("/three"))
	for _, want := range []string{"/one", "/two", "/three"} {
		if _, body := readBody(t, reader); body != want {
			t.Errorf("body %q, want %q", body, want)
		}
	}
}

func TestReactorStreamsChunkedAndLargeResponses(t *testing.T) {
	big := make([]byte, 3<<20)
	rand.Read(big)
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/chunked" {
			for i := 0; i < 5; i++ {
				fmt.Fprintf(w, "part%d;", i)
				w.(http.Flusher).Flush()
				time.Sleep(10 * time.Millisecond)
			}
			return
		}
		w.Header().Set("Content-Length", fmt.Sprint(len(big)))
		w.Write(big)
	})
	conn, reader := dial(t, fx.addr)
	io.WriteString(conn, keepAliveGet("/chunked"))
	res, body := readBody(t, reader)
	if body != "part0;part1;part2;part3;part4;" || len(res.TransferEncoding) == 0 {
		t.Errorf("chunked body %q, TE %v", body, res.TransferEncoding)
	}
	io.WriteString(conn, keepAliveGet("/big"))
	if _, body := readBody(t, reader); body != string(big) {
		t.Errorf("large body differs (%d bytes)", len(body))
	}
}

func TestReactorForwardsUploads(t *testing.T) {
	payload := bytes.Repeat([]byte("0123456789abcdef"), 1<<16) // 1 MiB
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		fmt.Fprintf(w, "%s %d %v", r.Method, len(b), bytes.Equal(b, payload))
	})
	conn, reader := dial(t, fx.addr)
	for i := 0; i < 2; i++ {
		fmt.Fprintf(conn, "POST /u HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\n\r\n", len(payload))
		conn.Write(payload)
		if _, body := readBody(t, reader); body != fmt.Sprintf("POST %d true", len(payload)) {
			t.Errorf("body %q", body)
		}
	}
}

// Requests outside the reactor's grammar take the net/http path and behave as
// in the default mode.
func TestReactorHandsOffWhatItDoesNotHandle(t *testing.T) {
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/echo":
			b, _ := io.ReadAll(r.Body)
			fmt.Fprintf(w, "%s|%s", r.Proto, b)
		case "/unframed":
			// No Content-Length, then close: the reactor resumes this response in net/http.
			conn, buf, _ := w.(http.Hijacker).Hijack()
			io.WriteString(buf, "HTTP/1.1 200 OK\r\nX-Path: unframed\r\n\r\nuntil-close")
			buf.Flush()
			conn.Close()
		case "/upgrade":
			conn, buf, _ := w.(http.Hijacker).Hijack()
			io.WriteString(buf, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n")
			buf.Flush()
			io.Copy(conn, buf)
			conn.Close()
		}
	})
	t.Run("chunked upload", func(t *testing.T) {
		conn, reader := dial(t, fx.addr)
		io.WriteString(conn, "POST /echo HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n")
		if _, body := readBody(t, reader); body != "HTTP/1.1|hello" {
			t.Errorf("body %q", body)
		}
	})
	t.Run("expect 100-continue", func(t *testing.T) {
		conn, reader := dial(t, fx.addr)
		io.WriteString(conn, "POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nExpect: 100-continue\r\n\r\n")
		res, err := http.ReadResponse(reader, nil)
		if err != nil || res.StatusCode != 100 {
			t.Fatalf("want 100 Continue, got %v %v", res, err)
		}
		io.WriteString(conn, "hello")
		if _, body := readBody(t, reader); body != "HTTP/1.1|hello" {
			t.Errorf("body %q", body)
		}
	})
	t.Run("HTTP/1.0", func(t *testing.T) {
		conn, reader := dial(t, fx.addr)
		io.WriteString(conn, "GET /echo HTTP/1.0\r\nHost: x\r\n\r\n")
		if _, body := readBody(t, reader); body != "HTTP/1.1|" {
			t.Errorf("body %q", body)
		}
	})
	t.Run("malformed target", func(t *testing.T) {
		res := rawRoundTrip(t, fx.addr, get("/%zz"))
		if res.StatusCode != 400 {
			t.Errorf("status %d, want net/http's 400", res.StatusCode)
		}
	})
	t.Run("response without framing", func(t *testing.T) {
		conn, reader := dial(t, fx.addr)
		io.WriteString(conn, keepAliveGet("/unframed"))
		res, body := readBody(t, reader)
		if res.Header.Get("X-Path") != "unframed" || body != "until-close" {
			t.Errorf("got %q %q", res.Header.Get("X-Path"), body)
		}
	})
	t.Run("upgrade", func(t *testing.T) {
		conn, reader := dial(t, fx.addr)
		io.WriteString(conn, "GET /upgrade HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n")
		res, err := http.ReadResponse(reader, nil)
		if err != nil || res.StatusCode != 101 {
			t.Fatalf("want 101, got %v %v", res, err)
		}
		io.WriteString(conn, "ping")
		got := make([]byte, 4)
		if _, err := io.ReadFull(reader, got); err != nil || string(got) != "ping" {
			t.Errorf("echo %q %v", got, err)
		}
	})
}

func TestReactorClosesAConnectionWhoseHeadersNeverFinish(t *testing.T) {
	fx := startReactor(t, nil, func(c *config) { c.headerTimeout = 200 * time.Millisecond })
	conn, _ := dial(t, fx.addr)
	io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n")
	start := time.Now()
	if _, err := io.ReadAll(conn); err != nil {
		t.Fatalf("connection not closed: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("closed after %v, want about 200ms", elapsed)
	}
	select {
	case <-fx.seen:
		t.Error("an incomplete request reached Node")
	default:
	}
}

func TestReactorClosesIdleClientsAfterKeepAlive(t *testing.T) {
	fx := startReactor(t, nil, func(c *config) { c.idleTimeout = 300 * time.Millisecond })
	conn, reader := dial(t, fx.addr)
	io.WriteString(conn, keepAliveGet("/"))
	readBody(t, reader)
	start := time.Now()
	if _, err := io.ReadAll(reader); err != nil {
		t.Fatalf("idle connection not closed: %v", err)
	}
	if elapsed := time.Since(start); elapsed < 250*time.Millisecond || elapsed > 2*time.Second {
		t.Errorf("closed after %v, want about 300ms", elapsed)
	}
}

func TestReactorDropsPooledConnectionsBeforeNodeDoes(t *testing.T) {
	fx := startReactor(t, nil, func(c *config) { c.upstreamIdle = 200 * time.Millisecond })
	rawRoundTrip(t, fx.addr, get("/"))
	time.Sleep(600 * time.Millisecond)
	rawRoundTrip(t, fx.addr, get("/"))
	if n := fx.upstreams.Load(); n != 2 {
		t.Errorf("Node accepted %d connections, want a fresh one after the pool idle time", n)
	}
}

func TestReactorDrainFinishesInFlightRequests(t *testing.T) {
	release := make(chan struct{})
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) {
		<-release
		io.WriteString(w, "finished")
	})
	idle, idleReader := dial(t, fx.addr)
	io.WriteString(idle, keepAliveGet("/"))
	go func() { time.Sleep(50 * time.Millisecond); close(release) }()
	readBody(t, idleReader)

	release = make(chan struct{})
	busy, busyReader := dial(t, fx.addr)
	io.WriteString(busy, keepAliveGet("/"))
	time.Sleep(100 * time.Millisecond)
	fx.front.beginDrain()
	// The idle connection closes; new connections are refused.
	if _, err := io.ReadAll(idleReader); err != nil {
		t.Errorf("idle connection not closed on drain: %v", err)
	}
	if c, err := net.DialTimeout("tcp", fx.addr, time.Second); err == nil {
		c.Close()
		t.Error("accepted a connection while draining")
	}
	select {
	case <-fx.done:
		t.Fatal("drain finished before the in-flight request")
	case <-time.After(200 * time.Millisecond):
	}
	close(release)
	res, body := readBody(t, busyReader)
	if body != "finished" || !res.Close {
		t.Errorf("got %q close=%v, want the full response with Connection: close", body, res.Close)
	}
	select {
	case err := <-fx.done:
		fx.done <- err
	case <-time.After(5 * time.Second):
		t.Fatal("drain never finished")
	}
}

func TestReactorAnswers502WhenNodeIsGone(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	dead := ln.Addr().String()
	ln.Close()
	front, _ := net.Listen("tcp", "127.0.0.1:0")
	f, err := newFrontend(config{upstream: dead, idleTimeout: time.Second, headerTimeout: time.Second, upstreamIdle: time.Second}, front.Addr().(*net.TCPAddr))
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- f.serve(front.(*net.TCPListener)) }()
	defer func() { f.beginDrain(); <-done }()
	res := rawRoundTrip(t, front.Addr().String(), get("/"))
	if res.StatusCode != http.StatusBadGateway {
		t.Errorf("status %d", res.StatusCode)
	}
}

// Node must see the same request from either mode.
func TestReactorForwardsWhatNetHTTPForwards(t *testing.T) {
	requests := []string{
		get("/"),
		get("/a?b=c", "X-Forwarded-For: 203.0.113.7\r\n", "Connection: X-Forwarded-For, X-Custom\r\n", "X-Custom: dropped\r\n"),
		get("/", "Forwarded: for=1.2.3.4\r\n", "Connection: Forwarded\r\n"),
		get("/", "Keep-Alive: timeout=5\r\n", "Proxy-Connection: keep-alive\r\n", "X-Kept: yes\r\n"),
		get("/", "X-Forwarded-Port: 8443\r\n", "Cookie: a=1\r\n", "Cookie: b=2\r\n"),
		"POST /p HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 3\r\nContent-Type: text/plain\r\n\r\nabc",
		"DELETE /d HTTP/1.1\r\nHost: shop.example.com:8080\r\nUser-Agent: test\r\nAccept-Encoding: gzip\r\nConnection: close\r\n\r\n",
	}
	for _, request := range requests {
		name := strings.SplitN(request, "\r\n", 2)[0]
		t.Run(name, func(t *testing.T) {
			addr, seen := startProxy(t, nil)
			rawRoundTrip(t, addr, request)
			want := <-seen
			fx := startReactor(t, nil)
			rawRoundTrip(t, fx.addr, request)
			got := <-fx.seen
			// The port differs between the two fronts.
			want.header.Del("X-Forwarded-Port")
			got.header.Del("X-Forwarded-Port")
			if strings.Contains(request, "X-Forwarded-Port: 8443") {
				want.header.Set("X-Forwarded-Port", "8443")
				got.header.Set("X-Forwarded-Port", "8443")
			}
			if got.requestURI != want.requestURI || got.host != want.host || fmt.Sprint(got.header) != fmt.Sprint(want.header) {
				t.Errorf("reactor forwarded\n  %q %q %v\nnet/http forwarded\n  %q %q %v", got.requestURI, got.host, got.header, want.requestURI, want.host, want.header)
			}
		})
	}
}
