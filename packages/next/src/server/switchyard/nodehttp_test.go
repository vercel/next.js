package main

import (
	"bufio"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

// sendRaw writes request on a new connection to addr and returns everything
// the server sends until it closes the connection.
func sendRaw(t *testing.T, addr, request string) string {
	t.Helper()
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := io.WriteString(conn, request); err != nil {
		t.Fatal(err)
	}
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	raw, err := io.ReadAll(conn)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// startLimitedSwitchyard runs Switchyard with Node's default header limits in
// front of an upstream that counts the requests reaching it.
func startLimitedSwitchyard(t *testing.T) (string, *atomic.Int32) {
	t.Helper()
	var reached atomic.Int32
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		reached.Add(1)
		io.WriteString(w, "ok")
	})
	return addr, &reached
}

func TestRefusesHeadersAtNodesByteLimitAsNodeDoes(t *testing.T) {
	addr, reached := startLimitedSwitchyard(t)
	// Node counts "/" + "Host" + "shop.example.com" + "Connection" + "close"
	// + "X-Pad" + the padding.
	counted := len("/") + len("Host") + len("shop.example.com") + len("Connection") + len("close") + len("X-Pad")
	request := func(padding int) string {
		return "GET / HTTP/1.1\r\nHost: shop.example.com\r\nConnection: close\r\nX-Pad: " + strings.Repeat("a", padding) + "\r\n\r\n"
	}
	limit := 16 << 10

	if got := sendRaw(t, addr, request(limit-counted-1)); !strings.HasPrefix(got, "HTTP/1.1 200 OK\r\n") {
		t.Errorf("one byte under Node's limit: got %q, want 200", got)
	}
	if got := sendRaw(t, addr, request(limit-counted)); got != nodeHeaderFieldsTooLarge {
		t.Errorf("at Node's limit: got %q, want Node's 431 %q", got, nodeHeaderFieldsTooLarge)
	}
	if n := reached.Load(); n != 1 {
		t.Errorf("%d requests reached Node, want only the one under the limit", n)
	}
}

func TestRefusesMoreHeaderLinesThanNodeReads(t *testing.T) {
	addr, reached := startLimitedSwitchyard(t)
	request := func(lines int) string {
		// Host and Connection are two of the lines.
		return "GET / HTTP/1.1\r\nHost: shop.example.com\r\nConnection: close\r\n" + strings.Repeat("A: 1\r\n", lines-2) + "\r\n"
	}

	if got := sendRaw(t, addr, request(testHeaderLines)); !strings.HasPrefix(got, "HTTP/1.1 200 OK\r\n") {
		t.Errorf("%d lines: got %q, want 200", testHeaderLines, got)
	}
	if got := sendRaw(t, addr, request(testHeaderLines+1)); got != nodeHeaderFieldsTooLarge {
		t.Errorf("%d lines: got %q, want Node's 431", testHeaderLines+1, got)
	}
	if n := reached.Load(); n != 1 {
		t.Errorf("%d requests reached Node, want 1", n)
	}
}

func TestClosesTheClientConnectionWhenNodeClosesIts(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Connection", "close")
		io.WriteString(w, "bye")
	})
	// Two requests on one connection: Switchyard must close it after the first.
	got := sendRaw(t, addr, "GET /a HTTP/1.1\r\nHost: shop.example.com\r\n\r\nGET /b HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
	if n := strings.Count(got, "HTTP/1.1 "); n != 1 || !strings.Contains(got, "\r\nConnection: close\r\n") {
		t.Errorf("got %q, want one response with Connection: close", got)
	}
}

func TestPassesOnNodesKeepAlive(t *testing.T) {
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		// What Node writes on a keep-alive response the app set no Connection on.
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Keep-Alive", "timeout=5")
		io.WriteString(w, "ok")
	})
	res := rawRoundTrip(t, addr, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
	if got := res.Header.Get("Connection"); got != "keep-alive" {
		t.Errorf("Connection = %q, want keep-alive", got)
	}
	if got := res.Header.Get("Keep-Alive"); got != "timeout=5" {
		t.Errorf("Keep-Alive = %q, want timeout=5", got)
	}
}

func TestClosesTheClientConnectionWhenNodeDropsIt(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		conn, _, err := w.(http.Hijacker).Hijack()
		if err == nil {
			conn.Close() // what socket.destroy() before an answer looks like
		}
	})
	if got := sendRaw(t, addr, "POST / HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 1\r\n\r\nx"); got != "" {
		t.Errorf("got %q, want the connection closed without an answer", got)
	}
}

func TestClosesTheConnectionAfterANonUpgradeAnswerToAnUpgrade(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		conn, buf, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer conn.Close()
		// What an upgrade handler writes before it ends the socket.
		buf.WriteString("HTTP/1.1 400 Bad Request\r\nContent-Length: 3\r\n\r\nbad")
		buf.Flush()
	})
	got := sendRaw(t, addr, "GET /socket HTTP/1.1\r\nHost: shop.example.com\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
	if !strings.HasPrefix(got, "HTTP/1.1 400 Bad Request\r\n") || !strings.Contains(got, "\r\nConnection: close\r\n") || !strings.HasSuffix(got, "bad") {
		t.Errorf("got %q, want the 400 with Connection: close, then the connection closed", got)
	}
}

func TestSendsOneConnectionCloseToAnHTTP10Client(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		// What Node writes on its HTTP/1.1 connection to Switchyard.
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Keep-Alive", "timeout=5")
		w.Header().Set("Content-Length", "2")
		io.WriteString(w, "ok")
	})
	got := sendRaw(t, addr, "GET / HTTP/1.0\r\nHost: shop.example.com\r\nConnection: keep-alive\r\n\r\n")
	head, _, _ := strings.Cut(got, "\r\n\r\n")
	if n := strings.Count(strings.ToLower(head), "\r\nconnection:"); n != 1 || !strings.Contains(head, "\r\nConnection: close") {
		t.Errorf("head %q, want exactly one Connection: close", head)
	}
	if strings.Contains(head, "Keep-Alive") {
		t.Errorf("head %q, want no Keep-Alive", head)
	}
}

func TestAnswersABrokenUploadInsteadOfDroppingTheConnection(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		io.WriteString(w, "read")
	})
	// "zz" isn't a chunk size: reading the body fails in Switchyard, not Node.
	got := sendRaw(t, addr, "POST / HTTP/1.1\r\nHost: shop.example.com\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\nzz\r\n")
	if !strings.HasPrefix(got, "HTTP/1.1 502 Bad Gateway\r\n") {
		t.Errorf("got %q, want a 502 answer", got)
	}
}

// sendAndStopSending writes request, shuts down the sending side of the
// connection, and returns everything the server sends until it closes.
func sendAndStopSending(t *testing.T, addr, request string) string {
	t.Helper()
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	io.WriteString(conn, request)
	conn.(*net.TCPConn).CloseWrite()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	raw, err := io.ReadAll(conn)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestAnswersAClientThatStopsSendingAfterItsRequest(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "answered")
	})
	for _, request := range []string{
		"GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n",
		"POST / HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 3\r\n\r\nabc",
	} {
		if got := sendAndStopSending(t, addr, request); !strings.HasPrefix(got, "HTTP/1.1 200 OK\r\n") || !strings.HasSuffix(got, "answered") {
			t.Errorf("%q: got %q, want the answer", request, got)
		}
	}
}

// Switchyard keeps sending to Node after the client stops sending: it must
// not end its own side of the connection to Node, which would leave that
// connection's loopback port waiting for minutes before it can be used again.
// A slower answer still reaches the client.
func TestKeepsTheConnectionToNodeOpenWhenTheClientStopsSending(t *testing.T) {
	sawEnd := make(chan bool, 1)
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done(): // Node's server would see an end of sending
			sawEnd <- true
		case <-time.After(300 * time.Millisecond):
			sawEnd <- false
			io.WriteString(w, "late")
		}
	})
	got := sendAndStopSending(t, addr, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
	if <-sawEnd {
		t.Error("the end of the client's sending reached the upstream")
	}
	if !strings.HasPrefix(got, "HTTP/1.1 200 OK\r\n") || !strings.HasSuffix(got, "late") {
		t.Errorf("got %q, want the late answer", got)
	}
}

// Node drops the connection while the client's upload is still coming and
// the client then pauses. Without Switchyard the client's connection closes at
// once; it must not wait for the rest of the upload or the request timeout.
func TestClosesTheConnectionWhenNodeDropsItMidUpload(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		if conn, _, err := w.(http.Hijacker).Hijack(); err == nil {
			conn.Close()
		}
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	// 10 bytes announced, 1 sent.
	io.WriteString(conn, "POST / HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 10\r\n\r\nx")
	start := time.Now()
	got, err := io.ReadAll(conn)
	if err != nil && !errors.Is(err, syscall.ECONNRESET) {
		t.Fatalf("connection not closed: %v (got %q)", err, got)
	}
	if len(got) != 0 {
		t.Errorf("got %q, want the connection closed without an answer", got)
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("connection closed after %v, want at once", elapsed)
	}
}

func TestCountsHeadersGoMovesOutOfTheHeaderMap(t *testing.T) {
	r, err := http.ReadRequest(bufio.NewReader(strings.NewReader("POST /upload?x=1 HTTP/1.1\r\nHost: shop.example.com\r\n" +
		"Transfer-Encoding: chunked\r\nTrailer: X-One, X-Two\r\nX-Other: v\r\n\r\n0\r\n\r\n")))
	if err != nil {
		t.Fatal(err)
	}
	bytes, lines := nodeRequestHeaders(r)
	wantBytes := len("/upload?x=1") + len("Host") + len("shop.example.com") +
		len("Transfer-Encoding") + len("chunked") + len("Trailer") + len("X-One, X-Two") + len("X-Other") + len("v")
	if bytes != wantBytes || lines != 4 {
		t.Errorf("counted %d bytes in %d lines, want %d bytes in 4 lines", bytes, lines, wantBytes)
	}
}
