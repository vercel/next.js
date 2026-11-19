package main

import (
	"bufio"
	"context"
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

// listenWithSmallQueue is an upstream whose queue of connections not yet
// accepted holds only 2, and which accepts nothing for stall: Node while it
// is busy, under a burst of new client connections. It returns the
// upstream's address as --upstream takes it.
func listenWithSmallQueue(t *testing.T, unix bool, stall time.Duration) string {
	t.Helper()
	var fd int
	var err error
	var addr string
	if unix {
		path := filepath.Join(t.TempDir(), "node.sock")
		fd, err = syscall.Socket(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
		if err == nil {
			err = syscall.Bind(fd, &syscall.SockaddrUnix{Name: path})
		}
		addr = "unix:" + path
	} else {
		fd, err = syscall.Socket(syscall.AF_INET, syscall.SOCK_STREAM, 0)
		if err == nil {
			err = syscall.Bind(fd, &syscall.SockaddrInet4{Addr: [4]byte{127, 0, 0, 1}})
		}
		if err == nil {
			sa, _ := syscall.Getsockname(fd)
			addr = fmt.Sprintf("127.0.0.1:%d", sa.(*syscall.SockaddrInet4).Port)
		}
	}
	if err != nil {
		t.Fatal(err)
	}
	if err := syscall.Listen(fd, 2); err != nil {
		t.Fatal(err)
	}
	file := os.NewFile(uintptr(fd), "upstream")
	ln, err := net.FileListener(file)
	file.Close()
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") })}
	go func() {
		time.Sleep(stall)
		srv.Serve(ln)
	}()
	t.Cleanup(func() {
		srv.Close()
		ln.Close()
	})
	return addr
}

// Over TCP, a connection to a full queue waits: the kernel drops the
// connection request and sends it again a moment later. Over a Unix socket
// the connect fails with EAGAIN instead, and without dialUpstream's retry
// most of these requests would get a 502.
func TestWaitsForRoomInNodesQueueOverTCPAndUnixSockets(t *testing.T) {
	for _, unix := range []bool{false, true} {
		t.Run(fmt.Sprintf("unix=%v", unix), func(t *testing.T) {
			upstream := listenWithSmallQueue(t, unix, 800*time.Millisecond)
			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			switchyard := newServer(newProxy(upstream, ln.Addr().(*net.TCPAddr), 4*time.Second, testToken), 5*time.Second, 5*time.Second, 0, 16<<10)
			go switchyard.Serve(ln)
			t.Cleanup(func() { switchyard.Close() })

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

// The wait for room in the queue ends when the client's request does.
func TestStopsWaitingForAFullQueueWhenTheRequestIsCancelled(t *testing.T) {
	upstream := listenWithSmallQueue(t, true, time.Hour)
	// Fill the queue.
	path := upstream[len("unix:"):]
	for {
		conn, err := net.Dial("unix", path)
		if err != nil {
			break
		}
		t.Cleanup(func() { conn.Close() })
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	start := time.Now()
	if conn, err := dialUpstream(ctx, upstream); err == nil {
		conn.Close()
		t.Fatal("dial succeeded with a full queue")
	}
	if elapsed := time.Since(start); elapsed < 150*time.Millisecond || elapsed > 2*time.Second {
		t.Errorf("gave up after %v, want about 200ms", elapsed)
	}
}
