package main

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Go's Transport sends a request again when a reused connection closes
// before any response arrives and it counts the request as replayable: no
// body, and GET, HEAD, OPTIONS or TRACE, or an Idempotency-Key header. Node's
// HTTP client never sends a request twice. These tests have the upstream run
// the handler and then hang up without answering, which is when sending again
// runs the handler's side effects twice.

// replayable lists the bodyless requests Go's Transport would send again, as
// the request line plus any extra header lines.
var replayable = []struct{ name, method, headers string }{
	{"GET", "GET", ""},
	{"HEAD", "HEAD", ""},
	{"OPTIONS", "OPTIONS", ""},
	{"TRACE", "TRACE", ""},
	{"POST with an Idempotency-Key", "POST", "Idempotency-Key: k\r\nContent-Length: 0\r\n"},
}

// keepAliveExchange sends each request on one client connection, waits for
// its response, and returns the status codes.
func keepAliveExchange(t *testing.T, addr string, requests ...string) []int {
	t.Helper()
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(10 * time.Second))
	br := bufio.NewReader(conn)
	var codes []int
	for _, request := range requests {
		if _, err := io.WriteString(conn, request); err != nil {
			t.Fatal(err)
		}
		method, _, _ := strings.Cut(request, " ")
		res, err := http.ReadResponse(br, &http.Request{Method: method})
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		res.Body.Close()
		codes = append(codes, res.StatusCode)
	}
	return codes
}

func TestNodeGetsAReplayableRequestOnceWhenItHangsUpWithoutAnswering(t *testing.T) {
	for _, tc := range replayable {
		t.Run(tc.name, func(t *testing.T) {
			var runs atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/hang-up" {
					runs.Add(1)
					// Go's server closes the connection without answering.
					panic(http.ErrAbortHandler)
				}
			}))
			t.Cleanup(upstream.Close)
			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			sy := newServer(newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second, testToken), time.Minute, 5*time.Second, 0, 16<<10)
			go sy.Serve(ln)
			t.Cleanup(func() { sy.Close() })

			// The first request leaves this client's connection to Node idle,
			// so the second one goes out on a reused connection.
			codes := keepAliveExchange(t, ln.Addr().String(),
				"GET /warm HTTP/1.1\r\nHost: example.com\r\n\r\n",
				tc.method+" /hang-up HTTP/1.1\r\nHost: example.com\r\n"+tc.headers+"\r\n")
			if got := runs.Load(); got != 1 {
				t.Errorf("Node ran the handler %d times, want 1", got)
			}
			if codes[1] != http.StatusBadGateway {
				t.Errorf("status %d, want 502", codes[1])
			}
		})
	}
}

func TestAWorkerGetsAReplayableRequestOnceWhenItHangsUpWithoutAnswering(t *testing.T) {
	// Requests with an Idempotency-Key go to Node (see
	// TestBodylessRequestsWithAnIdempotencyKeyGoToNode).
	for _, tc := range replayable[:4] {
		t.Run(tc.name, func(t *testing.T) {
			// One Transport serves every client's direct requests, so several
			// idle connections to a worker can be pooled at once. Go tries a
			// replayable request on each of them in turn, then on a new one.
			const pooled = 4
			var runs atomic.Int32
			var warm sync.WaitGroup
			warm.Add(pooled)
			fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.RawQuery == "mode=hangup" {
					runs.Add(1)
					panic(http.ErrAbortHandler)
				}
				// Hold every warm-up request until all of them have arrived,
				// so each has its own connection to the worker.
				warm.Done()
				warm.Wait()
			})
			// startDirect records every worker request in a small buffer.
			go func() {
				for {
					select {
					case <-fx.worker:
					case <-t.Context().Done():
						return
					}
				}
			}()
			var clients sync.WaitGroup
			for range pooled {
				clients.Add(1)
				go func() {
					defer clients.Done()
					fx.raw(t, "GET /api/echo HTTP/1.1")
				}()
			}
			clients.Wait()
			res := fx.raw(t, tc.method+" /api/echo?mode=hangup HTTP/1.1")
			if got := runs.Load(); got != 1 {
				t.Errorf("the worker ran the handler %d times, want 1", got)
			}
			if !strings.HasPrefix(res, "HTTP/1.1 500 ") {
				t.Errorf("%q, want a 500", firstLine(res))
			}
		})
	}
}

func firstLine(s string) string {
	line, _, _ := strings.Cut(s, "\r\n")
	return line
}

// unreadCloser is an upstream that answers the first request on each
// connection and then closes the connection as soon as the next request
// arrives, without reading it: what a server closing an idle keep-alive
// connection looks like when a request is already on its way. It counts the
// requests it answered.
func unreadCloser(t *testing.T) (string, *atomic.Int32) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	var answered atomic.Int32
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				br := bufio.NewReader(conn)
				req, err := http.ReadRequest(br)
				if err != nil {
					return
				}
				io.Copy(io.Discard, req.Body)
				answered.Add(1)
				fmt.Fprint(conn, "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
				// Wait for the next request, then close with it unread. The
				// kernel answers unread data with a reset.
				br.Peek(1)
				conn.(*net.TCPConn).SetLinger(0)
			}()
		}
	}()
	return ln.Addr().String(), &answered
}

// The case Go's resend hid: the upstream closed a reused connection before
// reading the request. Go used to send it again on a new connection; now the
// client gets a 502, as Node's client would fail the request too. Switchyard's
// idle timeout keeps this from happening with Node (see upstreamIdle).
func TestAnUpstreamClosingAReusedConnectionUnreadGives502(t *testing.T) {
	upstream, answered := unreadCloser(t)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	sy := newServer(newProxy(upstream, ln.Addr().(*net.TCPAddr), 4*time.Second, testToken), time.Minute, 5*time.Second, 0, 16<<10)
	go sy.Serve(ln)
	t.Cleanup(func() { sy.Close() })
	codes := keepAliveExchange(t, ln.Addr().String(),
		"GET /warm HTTP/1.1\r\nHost: example.com\r\n\r\n",
		"GET /second HTTP/1.1\r\nHost: example.com\r\n\r\n")
	if codes[1] != http.StatusBadGateway {
		t.Errorf("status %d, want 502", codes[1])
	}
	if got := answered.Load(); got != 1 {
		t.Errorf("the upstream answered %d requests, want 1", got)
	}
}
