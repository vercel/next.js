//go:build linux || darwin

package main

import (
	"bufio"
	"bytes"
	"debug/buildinfo"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestStrictRequests(t *testing.T) {
	bad := []string{
		"GET / HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\n",
		"POST / HTTP/1.1\r\nHost:x\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n",
		"POST / HTTP/1.1\r\nHost:x\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n\r\n",
		"GET / HTTP/1.1\r\nHost:x\r\nHost:y\r\n\r\n", "GET / HTTP/1.1\r\nHost:\r\n\r\n",
		"GET / HTTP/1.1\r\nHost:x\r\nConnection: Host\r\n\r\n", "GET / HTTP/1.1\r\nHost:x\r\nConnection: x,,y\r\n\r\n",
		"GET / HTTP/1.1\r\nHost:x\r\n folded: yes\r\n\r\n", "GET / HTTP/1.1\r\nHost:x\r\nX: bad\x01value\r\n\r\n",
		"GET http://x/ HTTP/1.1\r\nHost:x\r\n\r\n", "GET //x/ HTTP/1.1\r\nHost:x\r\n\r\n",
		"GET /a/%2e%2e/native HTTP/1.1\r\nHost:x\r\n\r\n", "GET /a\\b HTTP/1.1\r\nHost:x\r\n\r\n",
		"GET /a%5cb HTTP/1.1\r\nHost:x\r\n\r\n", "GET /a%00b HTTP/1.1\r\nHost:x\r\n\r\n",
		"GET /a#fragment HTTP/1.1\r\nHost:x\r\n\r\n", "GET / HTTP/1.1\r\nHost:x\r\n",
	}
	for _, s := range bad {
		if checkedRequest([]byte(s)) == nil {
			t.Errorf("accepted %q", s)
		}
	}
}
func TestHopFieldsAlwaysFiltered(t *testing.T) {
	for _, connection := range []string{"", "X-Secret"} {
		for _, name := range []string{"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "TE", "Trailer", "Transfer-Encoding", "Upgrade"} {
			if !hopHeader([]byte(name), []byte(connection)) {
				t.Fatal(name)
			}
		}
	}
	if !hopHeader([]byte("x-secret"), []byte("Keep-Alive, X-Secret")) {
		t.Fatal("Connection nomination ignored")
	}
}
func FuzzRequestFraming(f *testing.F) {
	for _, s := range []string{"GET / HTTP/1.1\r\nHost:x\r\n\r\n", "POST /native/a%2Fb?q=%252F HTTP/1.1\r\nHost:x\r\nContent-Length: 0\r\n\r\n", "GET /a/../b HTTP/1.1\r\nHost:x\r\n\r\n"} {
		f.Add([]byte(s))
	}
	f.Fuzz(func(t *testing.T, b []byte) {
		if len(b) > requestLimit {
			return
		}
		if checkedRequest(b) != nil {
			return
		}
		r, e := http.ReadRequest(bufio.NewReader(bytes.NewReader(b)))
		if e != nil {
			t.Fatalf("accepted request rejected by Go: %q: %v", b, e)
		}
		if _, e = validTarget(r.RequestURI); e != nil {
			t.Fatal(e)
		}
	})
}
func FuzzResponseFraming(f *testing.F) {
	f.Add([]byte("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"))
	f.Add([]byte("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\n"))
	f.Fuzz(func(t *testing.T, b []byte) {
		if len(b) > requestLimit || bytes.Index(b, []byte("\r\n\r\n")) != len(b)-4 {
			return
		}
		h, status, e := responseHeader(b)
		if e != nil {
			return
		}
		r, e := http.ReadResponse(bufio.NewReader(bytes.NewReader(b)), &http.Request{Method: "GET"})
		if e != nil || r.StatusCode != status {
			t.Fatalf("accepted response rejected by Go: %q: %v", b, e)
		}
		if h.hasLength && status >= 200 && status != 204 && status != 304 && r.ContentLength != h.length {
			t.Fatal("response boundary disagreement")
		}
	})
}

type deadlineBuffer struct{ io.Reader }

func (deadlineBuffer) Write(p []byte) (int, error)      { return len(p), nil }
func (deadlineBuffer) Close() error                     { return nil }
func (deadlineBuffer) LocalAddr() net.Addr              { return &net.TCPAddr{} }
func (deadlineBuffer) RemoteAddr() net.Addr             { return &net.TCPAddr{} }
func (deadlineBuffer) SetDeadline(time.Time) error      { return nil }
func (deadlineBuffer) SetReadDeadline(time.Time) error  { return nil }
func (deadlineBuffer) SetWriteDeadline(time.Time) error { return nil }

type recordingDeadlineConn struct {
	net.Conn
	deadlines chan time.Time
}

func (c recordingDeadlineConn) SetReadDeadline(deadline time.Time) error {
	select {
	case c.deadlines <- deadline:
	default:
	}
	return c.Conn.SetReadDeadline(deadline)
}

func TestHeaderDeadlineSurvivesBackgroundReadAbort(t *testing.T) {
	server, client := net.Pipe()
	defer server.Close()
	defer client.Close()
	deadlines := make(chan time.Time, 32)
	c := &streamConn{Conn: recordingDeadlineConn{server, deadlines}}
	s := &strictRequests{conn: c, reader: bufio.NewReaderSize(publicReader{c}, requestLimit+4096)}
	result := make(chan error, 1)
	go func() { var b [1024]byte; _, err := s.Read(b[:]); result <- err }()
	if _, err := io.WriteString(client, "GET / HTTP/1.1\r\nHost:"); err != nil {
		t.Fatal(err)
	}
	for {
		select {
		case deadline := <-deadlines:
			if deadline.After(time.Now()) && deadline.Before(time.Now().Add(6*time.Second)) {
				goto headerStarted
			}
		case <-time.After(time.Second):
			t.Fatal("header read did not start")
		}
	}
headerStarted:
	c.SetReadDeadline(time.Unix(1, 0)) // net/http abortPendingRead behavior.
	if err := <-result; err == nil {
		t.Fatal("background read was not interrupted")
	}
	first := s.headerLimit
	c.SetReadDeadline(time.Time{})
	for len(deadlines) != 0 {
		<-deadlines
	}
	go func() { var b [1024]byte; _, err := s.Read(b[:]); result <- err }()
	select {
	case next := <-deadlines:
		if !next.Equal(first) {
			t.Fatalf("header deadline extended after read interruption: %v -> %v", first, next)
		}
	case <-time.After(time.Second):
		t.Fatal("header read did not resume")
	}
	io.WriteString(client, "example.test\r\n\r\n")
	if err := <-result; err != nil {
		t.Fatal(err)
	}
}

func FuzzStrictStreamFraming(f *testing.F) {
	for _, wire := range []string{
		"GET /native/a HTTP/1.1\r\nHost:x\r\n\r\nGET /native/b HTTP/1.1\r\nHost:x\r\n\r\n",
		"POST /native/a HTTP/1.1\r\nHost:x\r\nContent-Length: 3\r\n\r\nabcGET /native/b HTTP/1.1\r\nHost:x\r\n\r\n",
		"POST /native/a HTTP/1.1\r\nHost:x\r\nTransfer-Encoding: chunked\r\nTrailer: X-End\r\n\r\n3;name=value\r\nabc\r\n0\r\nX-End: yes\r\n\r\nGET /native/b HTTP/1.1\r\nHost:x\r\n\r\n",
		"POST /native/a HTTP/1.1\r\nHost:x\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
		"GET /native/a HTTP/1.1\r\nHost:x\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\nGET /native/b HTTP/1.1\r\nHost:x\r\n\r\n",
	} {
		f.Add([]byte(wire))
	}
	f.Fuzz(func(t *testing.T, wire []byte) {
		if len(wire) > 2*requestLimit {
			return
		}
		c := &streamConn{Conn: deadlineBuffer{bytes.NewReader(wire)}}
		s := &strictRequests{conn: c, reader: bufio.NewReaderSize(c.Conn, requestLimit+4096)}
		var output bytes.Buffer
		var readErr error
		for {
			// Model an ordinary HTTP handler declining any upgrade. Actual
			// accepted/hijacked byte forwarding is covered by socket tests.
			c.upgrade.CompareAndSwap(0, 2)
			var b [37]byte
			n, err := s.Read(b[:])
			output.Write(b[:n])
			if err != nil {
				readErr = err
				break
			}
		}
		if !bytes.HasPrefix(wire, output.Bytes()) {
			t.Fatalf("rewrote or replayed wire bytes: %q -> %q", wire, output.Bytes())
		}
		if readErr != io.EOF {
			return
		}
		if !bytes.Equal(wire, output.Bytes()) {
			t.Fatalf("silently truncated wire bytes: %q -> %q", wire, output.Bytes())
		}
		br := bufio.NewReader(bytes.NewReader(output.Bytes()))
		for br.Buffered() > 0 || func() bool { _, err := br.Peek(1); return err == nil }() {
			r, err := http.ReadRequest(br)
			if err != nil {
				t.Fatalf("accepted request rejected by net/http: %q: %v", wire, err)
			}
			_, err = io.Copy(io.Discard, r.Body)
			r.Body.Close()
			if err != nil {
				t.Fatalf("accepted body rejected by net/http: %q: %v", wire, err)
			}
			if r.Close {
				break
			}
		}
	})
}

func TestStartupFailureCleanup(t *testing.T) {
	dir := t.TempDir()
	for _, tc := range []struct{ executable, protocol string }{{"missing", protocol}, {"bad", protocol}, {"bad", "incompatible"}} {
		t.Run(tc.executable+tc.protocol, func(t *testing.T) {
			if e := os.WriteFile(filepath.Join(dir, "bad"), []byte("#!/bin/sh\nexit 1\n"), 0700); e != nil {
				t.Fatal(e)
			}
			spec := manifest{Version: 2, Workers: []workerSpec{{ID: "go", Executable: tc.executable, Protocol: tc.protocol}}}
			raw, _ := json.Marshal(spec)
			file := filepath.Join(dir, "manifest.json")
			if e := os.WriteFile(file, raw, 0600); e != nil {
				t.Fatal(e)
			}
			f, e := startFrontend(launchConfig{Manifest: file, NodePort: 1, Token: "private"})
			if e == nil || f != nil {
				t.Fatal("accepted failed worker startup")
			}
		})
	}
}

func TestMalformedUpstreamClosesBeforeNextRequest(t *testing.T) {
	for _, raw := range []string{
		"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\n",
		"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\n\r\n",
		"HTTP/1.1 +20 OK\r\nContent-Length: 0\r\n\r\n",
		"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\npoison",
	} {
		t.Run(raw, func(t *testing.T) {
			var calls atomic.Int64
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				conn, _, e := w.(http.Hijacker).Hijack()
				if e != nil {
					return
				}
				defer conn.Close()
				io.WriteString(conn, raw)
			})
			addr, _ := testFrontend(t, handler)
			c := rawConn(t, addr)
			io.WriteString(c, "GET /native/a HTTP/1.1\r\nHost: x\r\n\r\nGET /native/b HTTP/1.1\r\nHost: x\r\n\r\n")
			br := bufio.NewReader(c)
			r, _ := response(t, br, "GET")
			if r.StatusCode != 502 {
				t.Fatalf("status=%d", r.StatusCode)
			}
			if _, e := br.ReadByte(); e != io.EOF {
				t.Fatalf("connection remained reusable: %v", e)
			}
			if calls.Load() != 1 {
				t.Fatal("dispatched pipelined request after framing error")
			}
		})
	}
}
func backendHandler(role string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Next-Go-Upstream-Token") != "private" {
			http.Error(w, "Forbidden", 403)
			return
		}
		w.Header().Set("X-Backend", role)
		switch r.URL.Path {
		case "/native/head":
			w.Header().Set("Content-Type", "application/json")
			w.Header().Add("Set-Cookie", "a=1")
			w.WriteHeader(201)
			json.NewEncoder(w).Encode(map[string]string{"hello": "head"})
			return
		case "/native/hop":
			w.Header().Set("Keep-Alive", "bad")
			w.Header().Set("Proxy-Connection", "bad")
			w.Header().Set("X-Next-Go-Metadata", "secret")
			w.Header().Add("Set-Cookie", "a=1")
			w.Header().Add("Set-Cookie", "b=2")
		case "/native/nominated":
			w.Header().Set("Connection", "X-Secret")
			w.Header().Set("X-Secret", "bad")
		case "/native/stream":
			w.Header().Set("Trailer", "X-Finished")
			io.WriteString(w, "first")
			w.(http.Flusher).Flush()
			io.WriteString(w, "second")
			w.Header().Set("X-Finished", "yes")
			return
		case "/native/cancel":
			io.WriteString(w, "first")
			w.(http.Flusher).Flush()
			<-r.Context().Done()
			return
		case "/native/upgrade":
			conn, buf, e := w.(http.Hijacker).Hijack()
			if e != nil {
				return
			}
			defer conn.Close()
			fmt.Fprint(buf, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n")
			buf.Flush()
			io.Copy(conn, buf)
			return
		}
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("X-Request-Trailer", r.Trailer.Get("X-End"))
		payload := role + ":" + r.URL.EscapedPath() + ":" + string(body)
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		io.WriteString(w, payload)
	})
}
func testFrontend(t *testing.T, handlers ...http.Handler) (string, *frontend) {
	t.Helper()
	node := httptest.NewServer(backendHandler("node"))
	port, _ := strconv.Atoi(strings.TrimPrefix(node.URL, "http://127.0.0.1:"))
	dir, e := os.MkdirTemp("/tmp", "next-front-test-")
	if e != nil {
		t.Fatal(e)
	}
	socket := filepath.Join(dir, "worker")
	worker, e := net.Listen("unix", socket)
	if e != nil {
		t.Fatal(e)
	}
	handler := backendHandler("go")
	if len(handlers) > 0 {
		handler = handlers[0]
	}
	workerServer := &http.Server{Handler: handler}
	go workerServer.Serve(worker)
	f := &frontend{internal: map[string]bool{"x-middleware-rewrite": true}, backends: []backendInfo{{Port: port, Token: "private"}, {Unix: socket, Token: "private"}}}
	f.router, e = newRouter(manifest{Routes: []route{{Path: "/native/[id]", Worker: "go", Handler: "route0"}, {Path: "/native/static"}, {Path: "/catch/[...slug]", Worker: "go", Handler: "route0"}, {Path: "/optional/[[...parts]]", Worker: "go", Handler: "route0"}}}, map[string]int{"go": 1})
	if e != nil {
		t.Fatal(e)
	}
	f.transport = &http.Transport{DialContext: f.dial, DisableCompression: true, MaxConnsPerHost: 16, MaxResponseHeaderBytes: requestLimit}
	listener, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	address := listener.Addr().String()
	done := make(chan error, 1)
	go func() { done <- serveEvents(listener.(*net.TCPListener), f) }()
	t.Cleanup(func() {
		f.draining.Store(true)
		f.force.Store(true)
		f.activeMu.Lock()
		for c := range f.active {
			c.Close()
		}
		f.activeMu.Unlock()
		f.transport.CloseIdleConnections()
		select {
		case e := <-done:
			if e != nil {
				t.Error(e)
			}
		case <-time.After(3 * time.Second):
			t.Error("reactor failed to drain")
		}
		f.wg.Wait()
		workerServer.Close()
		node.Close()
		os.RemoveAll(dir)
	})
	return address, f
}
func rawConn(t *testing.T, addr string) net.Conn {
	t.Helper()
	c, e := net.Dial("tcp", addr)
	if e != nil {
		t.Fatal(e)
	}
	c.SetDeadline(time.Now().Add(10 * time.Second))
	t.Cleanup(func() { c.Close() })
	return c
}
func response(t *testing.T, br *bufio.Reader, method string) (*http.Response, string) {
	t.Helper()
	r, e := http.ReadResponse(br, &http.Request{Method: method})
	if e != nil {
		t.Fatal(e)
	}
	body, e := io.ReadAll(r.Body)
	r.Body.Close()
	if e != nil {
		t.Fatal(e)
	}
	return r, string(body)
}
func TestPipeliningRoutingAndFiltering(t *testing.T) {
	addr, _ := testFrontend(t)
	c := rawConn(t, addr)
	paths := []string{"/native/one", "/native/static", "/catch/a/b%2Fc", "/optional", "/js", "/native/hop", "/native/nominated"}
	for _, path := range paths {
		fmt.Fprintf(c, "GET %s HTTP/1.1\r\nHost: example.test\r\nX-Next-Go-Upstream-Token: forged\r\nX-Middleware-Rewrite: /native/evil\r\n\r\n", path)
	}
	br := bufio.NewReader(c)
	for _, path := range paths {
		r, body := response(t, br, "GET")
		want := "go"
		if path == "/native/static" || path == "/js" {
			want = "node"
		}
		if r.StatusCode != 200 || !strings.HasPrefix(body, want+":") {
			t.Fatalf("%s: %d %q", path, r.StatusCode, body)
		}
		for _, name := range []string{"Keep-Alive", "Proxy-Connection", "X-Secret", "X-Next-Go-Metadata"} {
			if r.Header.Get(name) != "" {
				t.Fatalf("leaked %s", name)
			}
		}
		if path == "/native/hop" && len(r.Cookies()) != 2 {
			t.Fatal("lost repeated cookies")
		}
	}
}
func TestBodiesTrailersAndStreamingReuse(t *testing.T) {
	addr, _ := testFrontend(t)
	c := rawConn(t, addr)
	br := bufio.NewReader(c)
	fmt.Fprint(c, "POST /native/body HTTP/1.1\r\nHost: example.test\r\nTransfer-Encoding: chunked\r\nTrailer: X-End\r\n\r\n3\r\nabc\r\n0\r\nX-End: done\r\n\r\n")
	r, body := response(t, br, "POST")
	if body != "go:/native/body:abc" || r.Header.Get("X-Request-Trailer") != "done" {
		t.Fatalf("body/trailer: %q %v", body, r.Header)
	}
	for _, path := range []string{"/js", "/native/stream", "/native/again"} {
		fmt.Fprintf(c, "GET %s HTTP/1.1\r\nHost: example.test\r\n\r\n", path)
		r, body = response(t, br, "GET")
		if path == "/native/stream" {
			if body != "firstsecond" || r.Trailer.Get("X-Finished") != "yes" {
				t.Fatalf("stream/trailer %q %v", body, r.Trailer)
			}
		} else if !strings.Contains(body, path) {
			t.Fatal(body)
		}
	}
}
func TestStrictRejectionAfterStreamingHandoff(t *testing.T) {
	addr, _ := testFrontend(t)
	for _, initial := range []string{"POST /native/body HTTP/1.1\r\nHost:x\r\nContent-Length: 1\r\n\r\nx", "GET /native/stream HTTP/1.1\r\nHost:x\r\n\r\n"} {
		c := rawConn(t, addr)
		br := bufio.NewReader(c)
		fmt.Fprint(c, initial)
		response(t, br, "GET")
		fmt.Fprint(c, "POST /native/body HTTP/1.1\r\nHost:x\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\nGET /native/smuggled HTTP/1.1\r\nHost:x\r\n\r\n")
		c.SetReadDeadline(time.Now().Add(time.Second))
		r, e := http.ReadResponse(br, nil)
		if e == nil && r.StatusCode == 200 {
			t.Fatal("ambiguous request forwarded")
		}
		c.Close()
	}
}
func TestUpgradeAndCancellation(t *testing.T) {
	addr, f := testFrontend(t)
	c := rawConn(t, addr)
	fmt.Fprint(c, "GET /native/upgrade HTTP/1.1\r\nHost:x\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\necho")
	br := bufio.NewReader(c)
	r, e := http.ReadResponse(br, &http.Request{Method: "GET"})
	if e != nil || r.StatusCode != 101 {
		t.Fatalf("upgrade: %v %v", r, e)
	}
	b := make([]byte, 4)
	if _, e = io.ReadFull(br, b); e != nil || string(b) != "echo" {
		t.Fatalf("upgrade payload %q %v", b, e)
	}
	c.Close()
	c = rawConn(t, addr)
	fmt.Fprint(c, "GET /native/cancel HTTP/1.1\r\nHost:x\r\n\r\n")
	r, e = http.ReadResponse(bufio.NewReader(c), &http.Request{Method: "GET"})
	if e != nil {
		t.Fatal(e)
	}
	b = make([]byte, 5)
	if _, e = io.ReadFull(r.Body, b); e != nil {
		t.Fatal(e)
	}
	c.Close()
	deadline := time.Now().Add(2 * time.Second)
	for f.slowCount.Load() != 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if f.slowCount.Load() != 0 {
		t.Fatal("disconnect did not cancel upstream")
	}
}

func TestDeclinedUpgradePreservesPipelinedValidation(t *testing.T) {
	addr, _ := testFrontend(t)
	c := rawConn(t, addr)
	br := bufio.NewReader(c)
	fmt.Fprint(c, "GET /native/a HTTP/1.1\r\nHost:x\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\nGET /native/b HTTP/1.1\r\nHost:x\r\n\r\n")
	for _, path := range []string{"a", "b"} {
		r, body := response(t, br, "GET")
		if r.StatusCode != 200 || body != "go:/native/"+path+":" {
			t.Fatalf("declined upgrade lost request bytes: %d %q", r.StatusCode, body)
		}
	}
	c.Close()
	c = rawConn(t, addr)
	br = bufio.NewReader(c)
	fmt.Fprint(c, "GET /native/a HTTP/1.1\r\nHost:x\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\nPOST /native/b HTTP/1.1\r\nHost:x\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\n")
	response(t, br, "GET")
	c.SetReadDeadline(time.Now().Add(time.Second))
	if r, err := http.ReadResponse(br, nil); err == nil && r.StatusCode < 400 {
		t.Fatal("ambiguous request dispatched after declined upgrade")
	}
	c.Close()
}
func TestSocketBudget(t *testing.T) {
	f := &frontend{}
	baseline := socketCount.Load()
	reserved := 0
	for f.reserve() {
		reserved++
	}
	if int64(reserved) != maxSockets-baseline {
		t.Fatalf("socket budget %d", reserved)
	}
	for range reserved {
		f.release()
	}
	if socketCount.Load() != baseline {
		t.Fatal("reservation leak")
	}
}
func TestTrustedIdentity(t *testing.T) {
	f := &frontend{}
	headers := http.Header{"X-Forwarded-For": []string{"1.2.3.4"}, "X-Forwarded-Host": []string{"evil"}, "X-Forwarded-Proto": []string{"https"}}
	a, h, p, e := f.identity("127.0.0.1", "real", headers)
	if e != nil || a != "127.0.0.1" || h != "real" || p != "http" {
		t.Fatal(a, h, p, e)
	}
	_, network, _ := net.ParseCIDR("127.0.0.0/8")
	f.trusted = []*net.IPNet{network}
	a, h, p, e = f.identity("127.0.0.1", "real", headers)
	if e != nil || a != "1.2.3.4, 127.0.0.1" || h != "evil" || p != "https" {
		t.Fatal(a, h, p, e)
	}
}
func TestDifferentialGoNode(t *testing.T) {
	script := `const h=require('http');h.createServer((q,s)=>{let b='';q.on('data',x=>b+=x);q.on('end',()=>s.end(JSON.stringify({method:q.method,url:q.url,path:new URL(q.url,'http://x').pathname,body:b}))) }).listen(0,'127.0.0.1',function(){console.log(this.address().port)})`
	cmd := exec.Command("node", "-e", script)
	stdout, e := cmd.StdoutPipe()
	if e != nil {
		t.Fatal(e)
	}
	if e = cmd.Start(); e != nil {
		t.Fatal(e)
	}
	defer func() { cmd.Process.Kill(); cmd.Wait() }()
	port, e := bufio.NewReader(stdout).ReadString('\n')
	if e != nil {
		t.Fatal(e)
	}
	addr := "127.0.0.1:" + strings.TrimSpace(port)
	for _, target := range []string{"/native/a%2Fb?x=one&x=two", "/native/%252F", "/native/a%20b", "/optional/one/two", "/_next/a.js"} {
		raw := fmt.Sprintf("POST %s HTTP/1.1\r\nHost: example.test\r\nContent-Length: 3\r\n\r\nabc", target)
		header := raw[:strings.Index(raw, "\r\n\r\n")+4]
		if e = checkedRequest([]byte(header)); e != nil {
			t.Fatal(e)
		}
		r, e := http.ReadRequest(bufio.NewReader(strings.NewReader(raw)))
		if e != nil {
			t.Fatal(e)
		}
		body, _ := io.ReadAll(r.Body)
		c := rawConn(t, addr)
		io.WriteString(c, raw)
		_, data := response(t, bufio.NewReader(c), "POST")
		c.Close()
		var node map[string]string
		if e = json.Unmarshal([]byte(data), &node); e != nil {
			t.Fatal(e)
		}
		if node["url"] != r.RequestURI || node["path"] != r.URL.EscapedPath() || node["method"] != r.Method || node["body"] != string(body) {
			t.Fatalf("parser disagreement %q: %v vs %v", target, node, r)
		}
	}
}

func TestAbsoluteHeaderDeadline(t *testing.T) {
	addr, _ := testFrontend(t)
	c := rawConn(t, addr)
	stop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if _, e := c.Write([]byte("x")); e != nil {
					return
				}
			case <-stop:
				return
			}
		}
	}()
	defer close(stop)
	start := time.Now()
	c.Write([]byte("GET / HTTP/1.1\r\nHost:"))
	c.SetReadDeadline(start.Add(7 * time.Second))
	var b [1]byte
	_, err := c.Read(b[:])
	if err == nil {
		t.Fatal("unexpected response")
	}
	if time.Since(start) > 6*time.Second {
		t.Fatal("header deadline extended by incoming bytes")
	}
}
func TestTrailerMetadataFiltering(t *testing.T) {
	f := &frontend{internal: map[string]bool{"x-matched-path": true}}
	h := http.Header{"X-Next-Go-Metadata": []string{"forged"}, "X-Matched-Path": []string{"forged"}, "X-Forwarded-For": []string{"forged"}, "X-Nominated": []string{"forged"}, "X-Valid": []string{"yes"}}
	f.cleanTrailer(h, []byte("X-Nominated"))
	if len(h) != 1 || h.Get("X-Valid") != "yes" {
		t.Fatal(h)
	}
}

func TestHeadAfterBodyAndFresh(t *testing.T) {
	addr, _ := testFrontend(t)
	for _, bodyFirst := range []bool{false, true} {
		c := rawConn(t, addr)
		br := bufio.NewReader(c)
		if bodyFirst {
			fmt.Fprint(c, "POST /native/body HTTP/1.1\r\nHost: example.test\r\nContent-Length: 1\r\n\r\nx")
			response(t, br, "POST")
		}
		fmt.Fprint(c, "HEAD /native/head HTTP/1.1\r\nHost: example.test\r\n\r\n")
		r, body := response(t, br, "HEAD")
		if r.StatusCode != 201 || body != "" {
			t.Fatalf("bodyFirst=%v status=%d body=%q", bodyFirst, r.StatusCode, body)
		}
		c.Close()
	}
}

func TestCompiledWorkerContract(t *testing.T) {
	dir, e := os.MkdirTemp("/tmp", "next-sdk-test-")
	if e != nil {
		t.Fatal(e)
	}
	defer os.RemoveAll(dir)
	template, e := os.ReadFile("../../../../../crates/next-api/src/go_front_main.go")
	if e != nil {
		t.Fatal(e)
	}
	source := strings.ReplaceAll(string(template), "/*IMPORTS*/", "")
	source = strings.ReplaceAll(source, "/*ROUTES*/", `"route0":func(w http.ResponseWriter,r *http.Request,_ map[string][]string){io.ReadAll(r.Body);w.Header().Set("Content-Type","application/json");w.Header().Add("Set-Cookie","first=1");w.Header().Add("Set-Cookie","second=2");w.WriteHeader(201);json.NewEncoder(w).Encode(map[string]any{"hello":"worker","pid":os.Getpid()})},`)
	file := filepath.Join(dir, "worker.go")
	os.WriteFile(file, []byte(source), 0600)
	workerGo := os.Getenv("NEXT_GO_TEST_WORKER_COMPILER")
	if workerGo == "" {
		workerGo = "go"
	}
	environment := append(os.Environ(), "CGO_ENABLED=0", "GOWORK=off", "GOENV=off", "GOTOOLCHAIN=local", "GOROOT=", "GOFLAGS=")
	versionCommand := exec.Command(workerGo, "env", "GOVERSION")
	versionCommand.Env = environment
	version, err := versionCommand.Output()
	if err != nil {
		t.Fatal(err)
	}
	workerVersion := strings.TrimSpace(string(version))
	if os.Getenv("NEXT_GO_TEST_WORKER_COMPILER") != "" && workerVersion == runtime.Version() {
		t.Fatal("mixed-toolchain gate requires different frontend and worker Go versions")
	}
	command := exec.Command(workerGo, "build", "-o", filepath.Join(dir, "worker"), file)
	command.Env = environment
	if out, e := command.CombinedOutput(); e != nil {
		t.Fatalf("build SDK: %s %v", out, e)
	}
	info, err := buildinfo.ReadFile(filepath.Join(dir, "worker"))
	if err != nil || info.GoVersion != workerVersion {
		t.Fatalf("worker toolchain mismatch: %v %v", info, err)
	}
	t.Logf("frontend runtime %s; worker runtime %s", runtime.Version(), info.GoVersion)

	node := httptest.NewServer(backendHandler("node"))
	defer node.Close()
	port, _ := strconv.Atoi(strings.TrimPrefix(node.URL, "http://127.0.0.1:"))
	spec := manifest{Version: 2, Workers: []workerSpec{{ID: "go", Executable: "worker", Protocol: protocol}}, Routes: []route{{Path: "/native/[id]", Worker: "go", Handler: "route0"}}}
	raw, _ := json.Marshal(spec)
	file = filepath.Join(dir, "manifest.json")
	os.WriteFile(file, raw, 0600)
	f, e := startFrontend(launchConfig{Manifest: file, NodePort: port, Token: "private"})
	if e != nil {
		t.Fatal(e)
	}
	defer f.stop()
	listener, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	addr := listener.Addr().String()
	done := make(chan error, 1)
	go func() { done <- serveEvents(listener.(*net.TCPListener), f) }()
	defer func() {
		f.draining.Store(true)
		f.force.Store(true)
		f.activeMu.Lock()
		for c := range f.active {
			c.Close()
		}
		f.activeMu.Unlock()
		f.transport.CloseIdleConnections()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Error("drain timeout")
		}
		f.wg.Wait()
	}()
	for _, connection := range []string{"keep-alive", "close"} {
		c := rawConn(t, addr)
		br := bufio.NewReader(c)
		fmt.Fprintf(c, "POST /native/body HTTP/1.1\r\nHost: localhost\r\nConnection: %s\r\nContent-Length: 1\r\n\r\nx", connection)
		post, body := response(t, br, "POST")
		var data struct {
			Hello string
			PID   int
		}
		if json.Unmarshal([]byte(body), &data) != nil || data.Hello != "worker" || data.PID != f.children[0].Process.Pid || data.PID == os.Getpid() || len(post.Header.Values("Set-Cookie")) != 2 {
			t.Fatalf("handler did not run in the separate worker process: %s", body)
		}
		if connection == "close" {
			c.Close()
			c = rawConn(t, addr)
			br = bufio.NewReader(c)
		}
		fmt.Fprintf(c, "HEAD /native/head HTTP/1.1\r\nHost: localhost\r\nConnection: %s\r\n\r\n", "close")
		r, body := response(t, br, "HEAD")
		if r.StatusCode != 201 || body != "" {
			t.Fatalf("connection=%s status=%d body=%q", connection, r.StatusCode, body)
		}
		c.Close()
	}
}

func TestTrustedChainDropsSpoofedPrefix(t *testing.T) {
	_, network, _ := net.ParseCIDR("127.0.0.0/8")
	f := &frontend{trusted: []*net.IPNet{network}}
	chain, _, _, e := f.identity("127.0.0.1", "real", http.Header{"X-Forwarded-For": []string{"8.8.8.8, 192.0.2.5, 127.0.0.2"}})
	if e != nil || chain != "192.0.2.5, 127.0.0.2, 127.0.0.1" {
		t.Fatal(chain, e)
	}
}
