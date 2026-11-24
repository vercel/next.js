package main

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// compressResponse sends head to a Switchyard whose worker runs handler and
// returns the response with its body read whole.
func compressResponse(t *testing.T, fx *directFixture, head string) (*http.Response, []byte) {
	t.Helper()
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	fmt.Fprintf(conn, "%s\r\nHost: example.com\r\n\r\n", head)
	method, _, _ := strings.Cut(head, " ")
	res, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: method})
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res, body
}

func decode(t *testing.T, res *http.Response, body []byte) string {
	t.Helper()
	var r io.Reader
	var err error
	switch res.Header.Get("Content-Encoding") {
	case "gzip":
		r, err = gzip.NewReader(bytes.NewReader(body))
	case "deflate":
		r, err = zlib.NewReader(bytes.NewReader(body))
	default:
		return string(body)
	}
	if err != nil {
		t.Fatal(err)
	}
	out, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

func TestDirectResponsesAreCompressed(t *testing.T) {
	long := strings.Repeat("x", 2048)
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		if q.Has("png") {
			w.Header().Set("Content-Type", "image/png")
		}
		if e := q.Get("encoding"); e != "" {
			w.Header().Set("Content-Encoding", e)
		}
		body := long
		if q.Has("short") {
			body = "short"
		}
		if q.Has("chunked") {
			w.WriteHeader(http.StatusOK)
			w.(http.Flusher).Flush()
		}
		io.WriteString(w, body)
	})
	for _, c := range []struct {
		target, accept, encoding string
		chunked                  bool
		vary                     bool
	}{
		{"/api/echo", "gzip", "gzip", true, true},
		// Node's middleware would deflate this; gzhttp only sends gzip.
		{"/api/echo", "deflate", "", false, true},
		{"/api/echo", "br", "", false, true},
		{"/api/echo?short=1", "gzip", "", false, true},
		{"/api/echo?short=1&chunked=1", "gzip", "gzip", true, true},
		// gzhttp adds Vary to every response; the middleware only to
		// compressible types.
		{"/api/echo?png=1", "gzip", "", false, true},
		{"/api/echo?encoding=br", "gzip", "br", false, true},
		// The middleware treats identity as no encoding and compresses;
		// gzhttp leaves any Content-Encoding alone.
		{"/api/echo?encoding=identity", "gzip", "identity", false, true},
	} {
		res, body := compressResponse(t, fx, "GET "+c.target+" HTTP/1.1\r\nAccept-Encoding: "+c.accept)
		<-fx.worker
		name := c.target + " " + c.accept
		if got := res.Header.Get("Content-Encoding"); got != c.encoding {
			t.Errorf("%s: Content-Encoding %q, want %q", name, got, c.encoding)
		}
		if chunked := len(res.TransferEncoding) > 0; chunked != c.chunked || chunked == (res.Header.Get("Content-Length") != "") {
			t.Errorf("%s: chunked %v, Content-Length %q", name, chunked, res.Header.Get("Content-Length"))
		}
		if got := res.Header.Get("Vary") == "Accept-Encoding"; got != c.vary {
			t.Errorf("%s: Vary %q", name, res.Header.Get("Vary"))
		}
		want := long
		if strings.Contains(c.target, "short") {
			want = "short"
		}
		if c.encoding == "br" || c.encoding == "identity" {
			continue
		}
		if got := decode(t, res, body); got != want {
			t.Errorf("%s: body %q", name, got)
		}
	}
}

func TestADirectHeadRequestIsNotCompressed(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", "2048")
	})
	res, body := compressResponse(t, fx, "HEAD /api/echo HTTP/1.1\r\nAccept-Encoding: gzip")
	if res.Header.Get("Content-Encoding") != "" || res.Header.Get("Content-Length") != "2048" || len(body) != 0 {
		t.Errorf("HEAD: %v, body %d bytes", res.Header, len(body))
	}
	if res.Header.Get("Vary") != "Accept-Encoding" {
		t.Errorf("HEAD Vary %q", res.Header.Get("Vary"))
	}
}

// The client gets the gzip header first, the rest only as the compressor
// emits it, as with Node's middleware, which never flushes zlib between
// chunks.
func TestACompressedStreamIsHeldInTheCompressor(t *testing.T) {
	sent := make(chan struct{})
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		io.WriteString(w, "first")
		w.(http.Flusher).Flush()
		<-sent
		io.WriteString(w, "second")
	})
	release := sync.OnceFunc(func() { close(sent) })
	t.Cleanup(release)
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	fmt.Fprintf(conn, "GET /api/echo HTTP/1.1\r\nHost: example.com\r\nAccept-Encoding: gzip\r\n\r\n")
	res, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	head := make([]byte, 10)
	if _, err := io.ReadFull(res.Body, head); err != nil || !bytes.HasPrefix(head, []byte{0x1f, 0x8b, 8}) {
		t.Fatalf("gzip header %x, %v", head, err)
	}
	release()
	rest, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	zr, err := gzip.NewReader(io.MultiReader(bytes.NewReader(head), bytes.NewReader(rest)))
	if err != nil {
		t.Fatal(err)
	}
	if out, err := io.ReadAll(zr); err != nil || string(out) != "firstsecond" {
		t.Fatalf("body %q, %v", out, err)
	}
}

// A worker that fails mid-body must not leave the client a complete
// compressed stream.
func TestAnAbortedCompressedResponseStaysIncomplete(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		io.WriteString(w, strings.Repeat("x", 4096))
		w.(http.Flusher).Flush()
		panic(http.ErrAbortHandler)
	})
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	fmt.Fprintf(conn, "GET /api/echo HTTP/1.1\r\nHost: example.com\r\nAccept-Encoding: gzip\r\n\r\n")
	res, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.ReadAll(res.Body); err == nil {
		t.Fatal("the client read a complete response")
	}
}

func TestCompressibleTypesFollowTheMiddlewaresDatabase(t *testing.T) {
	for typ, want := range map[string]bool{
		"application/json; charset=utf-8":   true,
		"text/html":                         true,
		"application/x-switchyard+json":     true,
		"image/svg+xml":                     true,
		"application/wasm":                  true,
		"font/ttf":                          true,
		"image/x-icon":                      true,
		"application/x-www-form-urlencoded": true,
		"image/png":                         false,
		"font/woff2":                        false,
		"application/octet-stream":          false,
	} {
		if got := compressibleType(typ); got != want {
			t.Errorf("%s: %v, want %v", typ, got, want)
		}
	}
}

// The middleware doesn't compress a response without a Content-Type; gzhttp
// would guess one from the body.
func TestADirectResponseWithoutAContentTypeIsNotCompressed(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header()["Content-Type"] = nil
		io.WriteString(w, strings.Repeat("plain text ", 200))
	})
	res, body := compressResponse(t, fx, "GET /api/echo HTTP/1.1\r\nAccept-Encoding: gzip")
	if res.Header.Get("Content-Encoding") != "" || res.Header.Get("Content-Type") != "" || string(body) != strings.Repeat("plain text ", 200) {
		t.Fatalf("%v, body %d bytes", res.Header, len(body))
	}
}
