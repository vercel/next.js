//go:build linux

package main

// Fixtures from the review of the reactor (vercel/next.js#101743). Each test
// asserts the expected behavior: TestReactorTreatsSmugglingInputsLikeNetHTTP
// passes, the other two fail and show an issue.

import (
	"bufio"
	"io"
	"net"
	"net/http"
	"strings"
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

// Ambiguous or malformed framing (the classic request-smuggling inputs) must
// get the same treatment on both paths: the reactor parses headers itself, so
// any disagreement with net/http here is where smuggling bugs come from.
func TestReactorTreatsSmugglingInputsLikeNetHTTP(t *testing.T) {
	requests := map[string]string{
		"Content-Length and Transfer-Encoding": "POST /p HTTP/1.1\r\nHost: a\r\nContent-Length: 3\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n",
		"two different Content-Lengths":        "POST /p HTTP/1.1\r\nHost: a\r\nContent-Length: 3\r\nContent-Length: 4\r\n\r\nabcd",
		"Content-Length with a plus sign":      "POST /p HTTP/1.1\r\nHost: a\r\nContent-Length: +3\r\n\r\nabc",
		"Content-Length list":                  "POST /p HTTP/1.1\r\nHost: a\r\nContent-Length: 3, 3\r\n\r\nabc",
		"chunked then identity":                "POST /p HTTP/1.1\r\nHost: a\r\nTransfer-Encoding: chunked, identity\r\n\r\n3\r\nabc\r\n0\r\n\r\n",
		"folded header line":                   "GET /p HTTP/1.1\r\nHost: a\r\nX-Folded: a\r\n b\r\n\r\n",
		"space before the colon":               "GET /p HTTP/1.1\r\nHost : a\r\n\r\n",
		"two Host headers":                     "GET /p HTTP/1.1\r\nHost: a\r\nHost: b\r\n\r\n",
		"bare LF line endings":                 "GET /p HTTP/1.1\nHost: a\n\n",
	}
	for name, request := range requests {
		t.Run(name, func(t *testing.T) {
			addr, seen := startProxy(t, nil)
			want := send(t, addr, seen, request)
			fx := startReactor(t, nil)
			got := send(t, fx.addr, fx.seen, request)
			if got != want {
				t.Errorf("reactor: %+v, net/http: %+v", got, want)
			}
		})
	}
}

// "OPTIONS *" can't take the fast path (its target doesn't start with "/"),
// so the reactor hands it to net/http. After merging #101695's
// DisableGeneralOptionsHandler fix into the handover's newServer, it reaches
// Node; at aab45c4e9b, Go's server answers it itself.
func TestReactorForwardsOptionsStarToNode(t *testing.T) {
	fx := startReactor(t, nil)
	got := send(t, fx.addr, fx.seen, "OPTIONS * HTTP/1.1\r\nHost: a\r\nConnection: close\r\n\r\n")
	if got.upstream != "*" {
		t.Errorf("Node saw %q, want OPTIONS * forwarded", got.upstream)
	}
}

// A client that sends headers and then withholds its body must be cut off by
// the front, as next start cuts it off. The reactor's sweep skips requests in
// flight, and nothing else times them out; with #101695 merged it should use
// the --request-timeout-ms value. The stand-in for Node here never times out,
// so only the front can close the connection.
func TestReactorClosesARequestWhoseBodyNeverFinishes(t *testing.T) {
	fx := startReactor(t, func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
	}, func(cfg *config) {
		cfg.headerTimeout = 200 * time.Millisecond
		// After the merge: cfg.requestTimeout = 300 * time.Millisecond
	})
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	io.WriteString(conn, "POST /upload HTTP/1.1\r\nHost: a\r\nContent-Length: 10\r\n\r\nx")
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	start := time.Now()
	_, err = io.ReadAll(conn)
	if err != nil && strings.Contains(err.Error(), "timeout") {
		t.Fatalf("still open after %v: nothing timed out the request body", time.Since(start).Round(time.Millisecond))
	}
}
