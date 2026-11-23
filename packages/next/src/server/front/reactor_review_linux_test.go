//go:build linux

package main

// Fixtures from the review of vercel/next.js#101743 and #101747. Each test
// asserts the expected behavior and fails today, showing the difference.

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"testing"
	"time"
)

// outcome is what one front did with a raw request: the status it answered
// (0 if it closed without answering) and the request Node saw, if any.
type outcome struct {
	status   int
	upstream string // "METHOD target" Node received, or "" if nothing arrived
}

func send(t *testing.T, addr string, seen <-chan received, request string) outcome {
	t.Helper()
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	io.WriteString(conn, request)
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var out outcome
	if res, err := http.ReadResponse(bufio.NewReader(conn), nil); err == nil {
		out.status = res.StatusCode
	}
	select {
	case r := <-seen:
		out.upstream = r.requestURI
	case <-time.After(300 * time.Millisecond):
	}
	return out
}

// "OPTIONS *" can't take the fast path (its target doesn't start with "/"),
// so the reactor hands it to net/http. The handover's newServer is from
// before #101695 set DisableGeneralOptionsHandler, so Go's server answers it
// itself instead of passing it to Node. After rebasing onto #101695, the
// handover's newServer call takes the request timeout and brings this along.
func TestReactorForwardsOptionsStarToNode(t *testing.T) {
	fx := startReactor(t, nil)
	got := send(t, fx.addr, fx.seen, "OPTIONS * HTTP/1.1\r\nHost: a\r\nConnection: close\r\n\r\n")
	if got.upstream != "*" {
		t.Errorf("Node saw %q, want OPTIONS * forwarded", got.upstream)
	}
}

// listenWithSmallQueue is an upstream whose queue of not-yet-accepted
// connections holds only 2 (Node's is 511), and which doesn't accept for
// stall, as when Node's event loop is busy.
func listenWithSmallQueue(t *testing.T, unix bool, stall time.Duration) string {
	t.Helper()
	var fd int
	var err error
	var addr string
	if unix {
		path := filepath.Join(t.TempDir(), "node.sock")
		fd, _ = syscall.Socket(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
		err = syscall.Bind(fd, &syscall.SockaddrUnix{Name: path})
		addr = "unix:" + path
	} else {
		fd, _ = syscall.Socket(syscall.AF_INET, syscall.SOCK_STREAM, 0)
		err = syscall.Bind(fd, &syscall.SockaddrInet4{Addr: [4]byte{127, 0, 0, 1}})
		sa, _ := syscall.Getsockname(fd)
		addr = fmt.Sprintf("127.0.0.1:%d", sa.(*syscall.SockaddrInet4).Port)
	}
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Listen(fd, 2); err != nil {
		t.Fatal(err)
	}
	ln, err := net.FileListener(os.NewFile(uintptr(fd), "upstream"))
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") })}
	go func() { time.Sleep(stall); srv.Serve(ln) }()
	t.Cleanup(func() { srv.Close() })
	return addr
}

// When Node is slow to accept and its queue is full, a TCP connect waits
// (the kernel retries), so the requests are answered once Node catches up.
// A non-blocking connect to a Unix socket with a full queue fails at once with
// EAGAIN, and both paths answer 502. Expected: the same as over TCP.
func TestUnixUpstreamWaitsLikeTCPWhenNodesQueueIsFull(t *testing.T) {
	for _, path := range []string{"net/http", "reactor"} {
		for _, unix := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s unix=%v", path, unix), func(t *testing.T) {
				upstream := listenWithSmallQueue(t, unix, 800*time.Millisecond)
				ln, err := net.Listen("tcp", "127.0.0.1:0")
				if err != nil {
					t.Fatal(err)
				}
				cfg := config{upstream: upstream, idleTimeout: 5 * time.Second, headerTimeout: 5 * time.Second, upstreamIdle: 4 * time.Second}
				if path == "reactor" {
					f, err := newFrontend(cfg, ln.Addr().(*net.TCPAddr))
					if err != nil {
						t.Fatal(err)
					}
					go f.serve(ln.(*net.TCPListener))
					t.Cleanup(f.beginDrain)
				} else {
					srv := newServer(newProxy(upstream, ln.Addr().(*net.TCPAddr), cfg.upstreamIdle), cfg.idleTimeout, cfg.headerTimeout)
					go srv.Serve(ln)
					t.Cleanup(func() { srv.Close() })
				}

				var mu sync.Mutex
				statuses := map[string]int{}
				var wg sync.WaitGroup
				for i := 0; i < 20; i++ {
					wg.Add(1)
					go func() {
						defer wg.Done()
						status := "no response"
						if conn, err := net.Dial("tcp", ln.Addr().String()); err == nil {
							defer conn.Close()
							conn.SetDeadline(time.Now().Add(5 * time.Second))
							io.WriteString(conn, "GET / HTTP/1.1\r\nHost: a\r\n\r\n")
							if res, err := http.ReadResponse(bufio.NewReader(conn), nil); err == nil {
								status = res.Status
							}
						}
						mu.Lock()
						statuses[status]++
						mu.Unlock()
					}()
				}
				wg.Wait()
				if statuses["200 OK"] != 20 {
					t.Errorf("got %v, want all 20 answered 200 OK", statuses)
				}
			})
		}
	}
}
