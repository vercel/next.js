package main

import (
	"bufio"
	"io"
	"net"
	"net/http"
	"strings"
	"sync/atomic"
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
