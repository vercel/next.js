package main

import (
	"bufio"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// withSyncTransport turns the synctr knob on for one test. Run the whole
// suite with NEXT_FRONT_TUNE=synctr to check every other test against it too.
func withSyncTransport(t *testing.T) {
	_, had := tune["synctr"]
	tune["synctr"] = ""
	t.Cleanup(func() {
		if !had {
			delete(tune, "synctr")
		}
	})
}

func startFront(t *testing.T, upstream string) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	front := &http.Server{Handler: newProxy(upstream, ln.Addr().(*net.TCPAddr), 4*time.Second)}
	go front.Serve(ln)
	t.Cleanup(func() { front.Close() })
	return ln.Addr().String()
}

func TestSyncTransportReusesConnectionsToNode(t *testing.T) {
	withSyncTransport(t)
	var conns atomic.Int32
	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "ok")
	}))
	upstream.Config.ConnState = func(_ net.Conn, s http.ConnState) {
		if s == http.StateNew {
			conns.Add(1)
		}
	}
	upstream.Start()
	t.Cleanup(upstream.Close)
	addr := startFront(t, upstream.Listener.Addr().String())
	client := &http.Client{}
	for i := 0; i < 20; i++ {
		res, err := client.Get("http://" + addr + "/")
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if string(body) != "ok" {
			t.Fatalf("body %q", body)
		}
	}
	if n := conns.Load(); n != 1 {
		t.Fatalf("Node saw %d connections, want 1", n)
	}
}

func TestSyncTransportRetriesWhenNodeClosedAnIdleConnection(t *testing.T) {
	withSyncTransport(t)
	// Answers one request per connection as if keeping it alive, then closes
	// it, like Node's keep-alive timeout firing between requests.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				if _, err := http.ReadRequest(bufio.NewReader(conn)); err != nil {
					return
				}
				io.WriteString(conn, "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
			}()
		}
	}()
	addr := startFront(t, ln.Addr().String())
	for i := 0; i < 5; i++ {
		res, err := http.Get("http://" + addr + "/")
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != 200 || string(body) != "ok" {
			t.Fatalf("request %d: %d %q", i, res.StatusCode, body)
		}
		// Let the upstream's close reach the pooled connection.
		time.Sleep(20 * time.Millisecond)
	}
}

func TestSyncTransportClosesTheConnectionToNodeWhenTheClientLeaves(t *testing.T) {
	withSyncTransport(t)
	aborted := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			close(aborted)
		case <-time.After(5 * time.Second):
		}
	}))
	t.Cleanup(upstream.Close)
	addr := startFront(t, upstream.Listener.Addr().String())
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	io.WriteString(conn, "GET /slow HTTP/1.1\r\nHost: x\r\n\r\n")
	time.Sleep(100 * time.Millisecond)
	conn.Close()
	select {
	case <-aborted:
	case <-time.After(2 * time.Second):
		t.Fatal("Node never saw the request aborted")
	}
}

func TestSyncTransportForwardsEarlyHints(t *testing.T) {
	withSyncTransport(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Link", "</style.css>; rel=preload")
		w.WriteHeader(http.StatusEarlyHints)
		w.Header().Del("Link")
		io.WriteString(w, "ok")
	}))
	t.Cleanup(upstream.Close)
	addr := startFront(t, upstream.Listener.Addr().String())
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	io.WriteString(conn, get("/"))
	br := bufio.NewReader(conn)
	hints, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	if hints.StatusCode != http.StatusEarlyHints || hints.Header.Get("Link") == "" {
		t.Fatalf("first response %d %v, want 103 with Link", hints.StatusCode, hints.Header)
	}
	final, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(final.Body)
	if final.StatusCode != 200 || string(body) != "ok" {
		t.Fatalf("final response %d %q", final.StatusCode, body)
	}
}

func TestSyncTransportSendsRequestBodiesThroughHTTPTransport(t *testing.T) {
	withSyncTransport(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(w, r.Body)
	}))
	t.Cleanup(upstream.Close)
	addr := startFront(t, upstream.Listener.Addr().String())
	res, err := http.Post("http://"+addr+"/", "text/plain", strings.NewReader("hello"))
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if string(body) != "hello" {
		t.Fatalf("body %q", body)
	}
}

func TestSyncTransportStreamsChunkedResponses(t *testing.T) {
	withSyncTransport(t)
	release := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "first")
		w.(http.Flusher).Flush()
		<-release
		io.WriteString(w, "second")
	}))
	t.Cleanup(upstream.Close)
	addr := startFront(t, upstream.Listener.Addr().String())
	res, err := http.Get("http://" + addr + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	buf := make([]byte, 5)
	if _, err := io.ReadFull(res.Body, buf); err != nil || string(buf) != "first" {
		t.Fatalf("first chunk %q %v", buf, err)
	}
	close(release)
	rest, _ := io.ReadAll(res.Body)
	if string(rest) != "second" {
		t.Fatalf("rest %q", rest)
	}
}

func TestReachesNodeOverAUnixSocket(t *testing.T) {
	for _, sync := range []bool{false, true} {
		t.Run(map[bool]string{false: "http.Transport", true: "syncTransport"}[sync], func(t *testing.T) {
			if sync {
				withSyncTransport(t)
			}
			// t.TempDir() paths are too long for a socket address on macOS.
			dir, err := os.MkdirTemp("", "front")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { os.RemoveAll(dir) })
			sock := dir + "/node.sock"
			ln, err := net.Listen("unix", sock)
			if err != nil {
				t.Fatal(err)
			}
			upstream := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				io.WriteString(w, r.Host+" "+r.RequestURI)
			})}
			go upstream.Serve(ln)
			t.Cleanup(func() { upstream.Close() })
			addr := startFront(t, "unix:"+sock)
			for i := 0; i < 3; i++ {
				res := rawRoundTrip(t, addr, get("/a?b"))
				body, _ := io.ReadAll(res.Body)
				if string(body) != "shop.example.com /a?b" {
					t.Fatalf("Node saw %q", body)
				}
			}
		})
	}
}
