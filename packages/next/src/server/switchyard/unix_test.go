//go:build unix

package main

import (
	"bufio"
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// startUnixProxy runs Switchyard in front of an upstream on a Unix socket,
// as Node's is on Linux. It returns Switchyard's address, the requests the
// upstream saw, and how many connections the upstream accepted.
func startUnixProxy(t *testing.T, handler http.HandlerFunc) (string, <-chan received, func() int) {
	t.Helper()
	// t.TempDir paths can be too long for a socket address on macOS.
	dir, err := os.MkdirTemp("", "sy")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	socketPath := filepath.Join(dir, "node.sock")
	upstreamLn, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	accepted := 0
	seen := make(chan received, 16)
	upstream := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			seen <- received{requestURI: r.RequestURI, remoteAddr: r.RemoteAddr, host: r.Host, header: r.Header.Clone()}
			handler(w, r)
		}),
		ConnState: func(_ net.Conn, state http.ConnState) {
			if state == http.StateNew {
				mu.Lock()
				accepted++
				mu.Unlock()
			}
		},
	}
	go upstream.Serve(upstreamLn)
	t.Cleanup(func() { upstream.Close() })

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	switchyard := newServer(newProxy("unix:"+socketPath, ln.Addr().(*net.TCPAddr), 4*time.Second, testToken), time.Minute, 5*time.Second, 0, 16<<10)
	go switchyard.Serve(ln)
	t.Cleanup(func() { switchyard.Close() })
	count := func() int {
		mu.Lock()
		defer mu.Unlock()
		return accepted
	}
	return ln.Addr().String(), seen, count
}

func TestReachesNodeOverAUnixSocket(t *testing.T) {
	addr, seen, _ := startUnixProxy(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "ok")
	})
	res := rawRoundTrip(t, addr, get("/a%2Fb?x=1"))
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || string(body) != "ok" {
		t.Fatalf("got %d %q, want 200 \"ok\"", res.StatusCode, body)
	}
	r := <-seen
	if r.requestURI != "/a%2Fb?x=1" || r.host != "shop.example.com" {
		t.Errorf("Node saw %q with Host %q", r.requestURI, r.host)
	}
	// The client's address still reaches Node in the connection header, the
	// only place Node takes it from: a Unix socket has no peer address.
	if got := r.header.Get(connectionHeader); !strings.HasPrefix(got, testToken+";127.0.0.1:") {
		t.Errorf("connection header = %q", got)
	}
}

func TestReusesItsUnixConnectionToNodeForOneClient(t *testing.T) {
	addr, _, accepted := startUnixProxy(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "ok")
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	reader := bufio.NewReader(conn)
	for i := 0; i < 3; i++ {
		io.WriteString(conn, "GET / HTTP/1.1\r\nHost: a\r\n\r\n")
		res, err := http.ReadResponse(reader, nil)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		res.Body.Close()
	}
	if n := accepted(); n != 1 {
		t.Errorf("Node accepted %d connections for 3 requests on one client connection, want 1", n)
	}
}

// Only a full queue is worth waiting for. When nothing listens on the socket,
// as when Node has gone away, the dial fails at once, as it does over TCP.
func TestFailsAtOnceWhenNothingListensOnTheSocket(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing.sock")
	start := time.Now()
	_, err := dialUpstream(context.Background(), "unix:"+path)
	if err == nil {
		t.Fatal("dial succeeded")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("took %v to fail", elapsed)
	}
}

func TestDialsTCPForAHostAndPort(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	conn, err := dialUpstream(context.Background(), ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, ok := conn.(*net.TCPConn); !ok {
		t.Errorf("got a %T, want a TCP connection", conn)
	}
}
