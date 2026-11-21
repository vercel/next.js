package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

const testToken = "switchyard-test-token"

// received is what the stub upstream saw.
type received struct {
	requestURI string
	remoteAddr string
	host       string
	header     http.Header
}

// startProxy runs the proxy in front of an upstream that records each request
// and answers with handler. It returns the proxy's address.
func startProxy(t *testing.T, handler http.HandlerFunc) (string, <-chan received) {
	t.Helper()
	seen := make(chan received, 16)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- received{requestURI: r.RequestURI, remoteAddr: r.RemoteAddr, host: r.Host, header: r.Header.Clone()}
		if handler != nil {
			handler(w, r)
		}
	}))
	t.Cleanup(upstream.Close)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	switchyard := newServer(newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second, testToken), 0, 0, 0, 16<<10)
	go switchyard.Serve(ln)
	t.Cleanup(func() { switchyard.Close() })
	return ln.Addr().String(), seen
}

// rawRoundTrip writes a request byte for byte and returns the response.
func rawRoundTrip(t *testing.T, addr, request string) *http.Response {
	t.Helper()
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := io.WriteString(conn, request); err != nil {
		t.Fatal(err)
	}
	res, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { res.Body.Close() })
	return res
}

func get(target string, headers ...string) string {
	return fmt.Sprintf("GET %s HTTP/1.1\r\nHost: shop.example.com\r\n%sConnection: close\r\n\r\n", target, strings.Join(headers, ""))
}

func TestForwardsTheRequestTargetByteForByte(t *testing.T) {
	targets := []string{
		"/",
		"/a%2Fb",
		"/a%252Fb",
		"//x",
		"/a/../b",
		"/é",
		"/%C3%A9",
		"/a?q=%2F&r=a+b",
		"/a?",
		"/a?x=é",
	}
	for _, target := range targets {
		t.Run(target, func(t *testing.T) {
			addr, seen := startProxy(t, nil)
			rawRoundTrip(t, addr, get(target))
			if got := (<-seen).requestURI; got != target {
				t.Errorf("upstream got %q, want %q", got, target)
			}
		})
	}
}

func TestKeepsHost(t *testing.T) {
	addr, seen := startProxy(t, nil)
	rawRoundTrip(t, addr, get("/"))
	if got := (<-seen).host; got != "shop.example.com" {
		t.Errorf("upstream Host = %q", got)
	}
}

func TestKeepsForwardedHeadersTheClientSent(t *testing.T) {
	addr, seen := startProxy(t, nil)
	rawRoundTrip(t, addr, get("/",
		"X-Forwarded-For: 203.0.113.7, 198.51.100.2\r\n",
		"X-Forwarded-Host: shop.example.com\r\n",
		"X-Forwarded-Proto: https\r\n",
		"X-Forwarded-Port: 443\r\n",
		"Forwarded: for=203.0.113.7;proto=https\r\n",
	))
	header := (<-seen).header
	want := map[string]string{
		"X-Forwarded-For":   "203.0.113.7, 198.51.100.2",
		"X-Forwarded-Host":  "shop.example.com",
		"X-Forwarded-Proto": "https",
		"X-Forwarded-Port":  "443",
		"Forwarded":         "for=203.0.113.7;proto=https",
	}
	for name, value := range want {
		if got := strings.Join(header.Values(name), ", "); got != value {
			t.Errorf("%s = %q, want %q", name, got, value)
		}
	}
}

func TestFillsOnlyForAndPortWhenMissing(t *testing.T) {
	addr, seen := startProxy(t, nil)
	rawRoundTrip(t, addr, get("/"))
	header := (<-seen).header
	_, port, _ := net.SplitHostPort(addr)
	if got := header.Get("X-Forwarded-For"); got != "127.0.0.1" {
		t.Errorf("X-Forwarded-For = %q", got)
	}
	if got := header.Get("X-Forwarded-Port"); got != port {
		t.Errorf("X-Forwarded-Port = %q, want %q", got, port)
	}
	for _, name := range []string{"X-Forwarded-Host", "X-Forwarded-Proto", "Forwarded"} {
		if values, ok := header[name]; ok {
			t.Errorf("%s = %q, want it left to Node", name, values)
		}
	}
}

func TestReplacesUntrustedConnectionMetadata(t *testing.T) {
	addr, seen := startProxy(t, nil)
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n"+
		"Connection: close, X-Nextjs-Switchyard-Connection\r\n"+
		"X-Nextjs-Switchyard-Connection: forged;127.0.0.1:1234\r\n"+
		"X-Nextjs-Switchyard-Connection: another-forgery\r\n\r\n")
	res, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	values := (<-seen).header.Values(connectionHeader)
	if len(values) != 1 || values[0] != testToken+";"+conn.LocalAddr().String() {
		t.Fatalf("untrusted connection metadata was not replaced: %v", values)
	}
}

func TestUpstreamConnectionsKeepOneClientIdentity(t *testing.T) {
	addr, seen := startProxy(t, nil)
	first, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	roundTrip := func(conn net.Conn, reader *bufio.Reader) received {
		t.Helper()
		io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
		res, err := http.ReadResponse(reader, nil)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		res.Body.Close()
		got := <-seen
		if got.header.Get(connectionHeader) != testToken+";"+conn.LocalAddr().String() {
			t.Fatal("upstream received the wrong client identity")
		}
		return got
	}
	firstReader, secondReader := bufio.NewReader(first), bufio.NewReader(second)
	a := roundTrip(first, firstReader)
	b := roundTrip(second, secondReader)
	c := roundTrip(first, firstReader)
	if a.remoteAddr == b.remoteAddr {
		t.Fatal("different clients shared an upstream socket")
	}
	if a.remoteAddr != c.remoteAddr {
		t.Fatal("a keep-alive client did not reuse its upstream socket")
	}
}

func TestRejectsOversizedIncompleteHeadersBeforeReachingNode(t *testing.T) {
	for _, limit := range []int{8192, 16384, 32768} {
		t.Run(fmt.Sprint(limit), func(t *testing.T) {
			seen := make(chan struct{}, 1)
			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			srv := newServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seen <- struct{}{}
			}), time.Second, 30*time.Second, 0, limit)
			go srv.Serve(ln)
			defer srv.Close()
			conn, err := net.Dial("tcp", ln.Addr().String())
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(5 * time.Second))
			// No terminating blank line: rejection must happen while reading,
			// without waiting for either Node or the 30-second header deadline.
			io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\nX-Large: "+strings.Repeat("a", limit))
			res, err := http.ReadResponse(bufio.NewReader(conn), nil)
			if err != nil {
				t.Fatalf("oversized incomplete headers were not rejected: %v", err)
			}
			res.Body.Close()
			if res.StatusCode != http.StatusRequestHeaderFieldsTooLarge {
				t.Fatalf("status = %d, want 431", res.StatusCode)
			}
			select {
			case <-seen:
				t.Fatal("oversized headers reached the handler")
			default:
			}
		})
	}
}

func TestAddsNoUserAgentOrAcceptEncoding(t *testing.T) {
	addr, seen := startProxy(t, nil)
	rawRoundTrip(t, addr, get("/"))
	header := (<-seen).header
	for _, name := range []string{"User-Agent", "Accept-Encoding"} {
		if values, ok := header[name]; ok {
			t.Errorf("%s = %q, want none", name, values)
		}
	}
}

func TestAddsNoContentTypeNodeDidNotSend(t *testing.T) {
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		// Suppress the upstream server's own sniffing, as Node never sniffs.
		w.Header()["Content-Type"] = nil
		io.WriteString(w, "<html>looks like HTML</html>")
	})
	res := rawRoundTrip(t, addr, get("/"))
	if values, ok := res.Header["Content-Type"]; ok {
		t.Errorf("Content-Type = %q, want none", values)
	}
}

func TestForwardsAResponseBeforeTheUploadFinishes(t *testing.T) {
	for _, status := range []int{http.StatusOK, http.StatusForbidden} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
				// The stand-in for Node must allow a response while the request
				// body is still arriving, as Node does.
				controller := http.NewResponseController(w)
				if err := controller.EnableFullDuplex(); err != nil {
					t.Error(err)
					return
				}
				var first [1]byte
				if _, err := io.ReadFull(r.Body, first[:]); err != nil {
					t.Error(err)
					return
				}
				w.WriteHeader(status)
				io.WriteString(w, "first")
				if err := controller.Flush(); err != nil {
					t.Error(err)
					return
				}
				if status == http.StatusOK {
					io.Copy(io.Discard, r.Body)
					io.WriteString(w, "-last")
				}
			})
			conn, err := net.Dial("tcp", addr)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(5 * time.Second))
			// Keep the connection alive and send only part of the body. A client
			// that waits for the first response chunk must not deadlock here.
			io.WriteString(conn, "POST /upload HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 10\r\n\r\na")
			res, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: http.MethodPost})
			if err != nil {
				t.Fatalf("response headers before the upload finishes: %v", err)
			}
			defer res.Body.Close()
			if res.StatusCode != status {
				t.Fatalf("status = %d, want %d", res.StatusCode, status)
			}
			var first [5]byte
			if _, err := io.ReadFull(res.Body, first[:]); err != nil {
				t.Fatalf("response chunk before the upload finishes: %v", err)
			}
			if string(first[:]) != "first" {
				t.Fatalf("first chunk = %q", first)
			}
			io.WriteString(conn, "bcdefghij")
			body, err := io.ReadAll(res.Body)
			if err != nil {
				t.Fatal(err)
			}
			want := ""
			if status == http.StatusOK {
				want = "-last"
			}
			if string(body) != want {
				t.Errorf("remaining body = %q, want %q", body, want)
			}
		})
	}
}

func TestAddsNoContentTypeAfterAnEarlyHint(t *testing.T) {
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Link", "</a.css>; rel=preload")
		w.WriteHeader(http.StatusEarlyHints)
		w.Header()["Content-Type"] = nil
		w.Write([]byte("<html>hello</html>"))
	})
	// Go's client skips the 103 and returns the final response.
	res, err := http.Get("http://" + addr + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if v, ok := res.Header["Content-Type"]; ok {
		t.Errorf("Content-Type %q, want none", v)
	}
}

// The Early Hints themselves still reach the client, each with its own Link
// header, and nothing from them leaks into the final response.
func TestPassesOnEveryEarlyHint(t *testing.T) {
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Link", "</a.css>; rel=preload")
		w.WriteHeader(http.StatusEarlyHints)
		w.Header().Set("Link", "</b.js>; rel=preload")
		w.WriteHeader(http.StatusEarlyHints)
		// Go's server, unlike Node's writeEarlyHints, keeps headers set for a
		// 1xx and sends them again with the final response; clear them so the
		// stand-in for Node sends only what Node would.
		delete(w.Header(), "Link")
		w.Header()["Content-Type"] = nil
		w.Write([]byte("<html>hello</html>"))
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(conn, get("/"))
	reader := bufio.NewReader(conn)
	// http.ReadResponse returns a 1xx as it is; Go's client would skip it.
	var links []string
	for {
		res, err := http.ReadResponse(reader, nil)
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode == http.StatusEarlyHints {
			links = append(links, res.Header.Get("Link"))
			continue
		}
		io.Copy(io.Discard, res.Body)
		if res.StatusCode != http.StatusOK {
			t.Errorf("final status %d, want 200", res.StatusCode)
		}
		if v, ok := res.Header["Content-Type"]; ok {
			t.Errorf("final Content-Type %q, want none", v)
		}
		if v := res.Header.Get("Link"); v != "" {
			t.Errorf("final response has Link %q from an Early Hint", v)
		}
		break
	}
	want := []string{"</a.css>; rel=preload", "</b.js>; rel=preload"}
	if strings.Join(links, "|") != strings.Join(want, "|") {
		t.Errorf("Early Hints Link headers %q, want %q", links, want)
	}
}

func TestKeepsEverySetCookie(t *testing.T) {
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Set-Cookie", "a=1")
		w.Header().Add("Set-Cookie", "b=2")
	})
	res := rawRoundTrip(t, addr, get("/"))
	if got := res.Header.Values("Set-Cookie"); strings.Join(got, "|") != "a=1|b=2" {
		t.Errorf("Set-Cookie = %q", got)
	}
}

func TestClientIP(t *testing.T) {
	cases := []struct {
		remote  string
		mapIPv4 bool
		want    string
	}{
		{"127.0.0.1:5000", false, "127.0.0.1"},
		{"127.0.0.1:5000", true, "::ffff:127.0.0.1"},
		{"[::1]:5000", true, "::1"},
		{"[2001:db8::1]:5000", false, "2001:db8::1"},
	}
	for _, c := range cases {
		if got := clientIP(c.remote, c.mapIPv4); got != c.want {
			t.Errorf("clientIP(%q, %v) = %q, want %q", c.remote, c.mapIPv4, got, c.want)
		}
	}
}

func TestUsesStandardStatusText(t *testing.T) {
	for _, tc := range []struct {
		status string
		code   int
	}{
		{"400 Invalid JSON", http.StatusBadRequest},
		{"413 Payload Too Large", http.StatusRequestEntityTooLarge},
		{"200 Custom Reason", http.StatusOK},
		{"200 OK", http.StatusOK},
		{"404 Not Found", http.StatusNotFound},
	} {
		t.Run(tc.status, func(t *testing.T) {
			addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
				conn, buf, _ := w.(http.Hijacker).Hijack()
				defer conn.Close()
				fmt.Fprintf(buf, "HTTP/1.1 %s\r\nContent-Length: 5\r\nX-Kept: yes\r\n\r\nhello", tc.status)
				buf.Flush()
			})
			conn, err := net.Dial("tcp", addr)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			io.WriteString(conn, get("/"))
			res, err := http.ReadResponse(bufio.NewReader(conn), nil)
			if err != nil {
				t.Fatal(err)
			}
			body, _ := io.ReadAll(res.Body)
			want := fmt.Sprintf("%d %s", tc.code, http.StatusText(tc.code))
			if res.Status != want || string(body) != "hello" || res.Header.Get("X-Kept") != "yes" {
				t.Errorf("got %q %q %q, want %q hello yes", res.Status, body, res.Header.Get("X-Kept"), want)
			}
		})
	}
}

func TestKeepsTrailersWithACustomStatusLine(t *testing.T) {
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		conn, buf, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		io.WriteString(buf, "HTTP/1.1 400 Custom Reason\r\nTransfer-Encoding: chunked\r\nTrailer: X-Checksum, X-Extra\r\n\r\n4\r\nbody\r\n0\r\nX-Checksum: abc123\r\nX-Checksum: second\r\nX-Extra: kept\r\n\r\n")
		buf.Flush()
	})
	res := rawRoundTrip(t, addr, get("/"))
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "400 Bad Request" || string(body) != "body" {
		t.Fatalf("got %q %q, want 400 Bad Request body", res.Status, body)
	}
	if got := strings.Join(res.Trailer.Values("X-Checksum"), "|"); got != "abc123|second" {
		t.Errorf("X-Checksum trailer = %q, want abc123|second", got)
	}
	if got := res.Trailer.Get("X-Extra"); got != "kept" {
		t.Errorf("X-Extra trailer = %q, want kept", got)
	}
}

func TestKeepsACustomStatusConnectionAlive(t *testing.T) {
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/custom" {
			conn, buf, _ := w.(http.Hijacker).Hijack()
			defer conn.Close()
			io.WriteString(buf, "HTTP/1.1 400 Custom Reason\r\nContent-Length: 5\r\n\r\nhello")
			buf.Flush()
		} else {
			io.WriteString(w, "HTTP/1.1 400 Bad Request\r\n")
		}
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	reader := bufio.NewReader(conn)
	for _, tc := range []struct{ path, status, body string }{
		{"/custom", "400 Bad Request", "hello"},
		{"/standard", "200 OK", "HTTP/1.1 400 Bad Request\r\n"},
	} {
		fmt.Fprintf(conn, "GET %s HTTP/1.1\r\nHost: shop.example.com\r\n\r\n", tc.path)
		res, err := http.ReadResponse(reader, nil)
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(res.Body)
		res.Body.Close()
		if err != nil || res.Status != tc.status || string(body) != tc.body {
			t.Fatalf("got %q %q, %v, want %q %q", res.Status, body, err, tc.status, tc.body)
		}
		if res.Close {
			t.Fatal("response closed the keep-alive connection")
		}
	}
}

func TestKeepsHeadSemanticsWithACustomStatusLine(t *testing.T) {
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		conn, buf, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		io.WriteString(buf, "HTTP/1.1 400 Custom Reason\r\nContent-Length: 5\r\n\r\n")
		buf.Flush()
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(conn, "HEAD / HTTP/1.1\r\nHost: shop.example.com\r\nConnection: close\r\n\r\n")
	reader := bufio.NewReader(conn)
	res, err := http.ReadResponse(reader, &http.Request{Method: http.MethodHead})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "400 Bad Request" || res.ContentLength != 5 {
		t.Fatalf("got %q with length %d, want 400 Bad Request with length 5", res.Status, res.ContentLength)
	}
	// Read the wire, rather than res.Body, which a HEAD client always treats
	// as empty even if the server incorrectly writes bytes after the headers.
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) != 0 {
		t.Errorf("HEAD response wrote a body: %q", body)
	}
}

func TestKeepsAnUpgradeWithACustomStatusLine(t *testing.T) {
	for _, status := range []string{"101 Switching Protocols", "101 Custom Upgrade"} {
		t.Run(status, func(t *testing.T) {
			addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
				conn, buf, _ := w.(http.Hijacker).Hijack()
				defer conn.Close()
				fmt.Fprintf(buf, "HTTP/1.1 %s\r\nConnection: Upgrade\r\nUpgrade: switchyard-test\r\n\r\n", status)
				buf.Flush()
				io.Copy(conn, buf)
			})
			conn, err := net.Dial("tcp", addr)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(5 * time.Second))
			io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\nConnection: Upgrade\r\nUpgrade: switchyard-test\r\n\r\n")
			reader := bufio.NewReader(conn)
			res, err := http.ReadResponse(reader, nil)
			if err != nil {
				t.Fatal(err)
			}
			if res.Status != status || res.Header.Get("Upgrade") != "switchyard-test" {
				t.Fatalf("got %q with Upgrade %q", res.Status, res.Header.Get("Upgrade"))
			}
			io.WriteString(conn, "ping")
			var echo [4]byte
			if _, err := io.ReadFull(reader, echo[:]); err != nil {
				t.Fatalf("bidirectional upgrade: %v", err)
			}
			if string(echo[:]) != "ping" {
				t.Errorf("echo = %q, want ping", echo)
			}
		})
	}
}

func TestCancelsAStreamWhenTheClientDisconnects(t *testing.T) {
	for _, request := range []struct{ name, text string }{
		{"GET", "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n"},
		{"POST", "POST / HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 10\r\n\r\nabcdefghij"},
		{"unfinished POST", "POST / HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 10\r\n\r\na"},
	} {
		for _, status := range []string{"200 OK", "200 Custom Reason"} {
			t.Run(request.name+"/"+status, func(t *testing.T) {
				upstream, err := net.Listen("tcp", "127.0.0.1:0")
				if err != nil {
					t.Fatal(err)
				}
				release := make(chan struct{})
				disconnected := make(chan struct{})
				upstreamDone := make(chan struct{})
				go func() {
					defer close(upstreamDone)
					conn, err := upstream.Accept()
					if err != nil {
						return
					}
					defer conn.Close()
					go func() {
						<-release
						conn.Close()
					}()
					reader := bufio.NewReader(conn)
					if _, err := http.ReadRequest(reader); err != nil {
						return
					}
					fmt.Fprintf(conn, "HTTP/1.1 %s\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nfirst\r\n", status)
					io.Copy(io.Discard, reader)
					close(disconnected)
				}()
				ln, err := net.Listen("tcp", "127.0.0.1:0")
				if err != nil {
					close(release)
					upstream.Close()
					t.Fatal(err)
				}
				switchyard := newServer(newProxy(upstream.Addr().String(), ln.Addr().(*net.TCPAddr), time.Second, testToken), 5*time.Second, 5*time.Second, 0, 16<<10)
				go switchyard.Serve(ln)
				t.Cleanup(func() {
					close(release)
					upstream.Close()
					switchyard.Close()
					<-upstreamDone
				})
				client, err := net.Dial("tcp", ln.Addr().String())
				if err != nil {
					t.Fatal(err)
				}
				defer client.Close()
				client.SetDeadline(time.Now().Add(5 * time.Second))
				io.WriteString(client, request.text)
				res, err := http.ReadResponse(bufio.NewReader(client), nil)
				if err != nil {
					t.Fatal(err)
				}
				var first [5]byte
				if _, err := io.ReadFull(res.Body, first[:]); err != nil {
					t.Fatal(err)
				}
				select {
				case <-disconnected:
					t.Fatal("the upstream closed before the client disconnected")
				default:
				}
				client.Close()
				select {
				case <-disconnected:
				case <-time.After(3 * time.Second):
					t.Fatal("the upstream stayed open after the client disconnected")
				}
			})
		}
	}
}

func TestStreamsACustomStatusDuringAnUpload(t *testing.T) {
	upstream, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer upstream.Close()
	upstreamDone := make(chan struct{})
	go func() {
		defer close(upstreamDone)
		conn, err := upstream.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		conn.SetDeadline(time.Now().Add(5 * time.Second))
		req, err := http.ReadRequest(bufio.NewReader(conn))
		if err != nil {
			t.Error(err)
			return
		}
		var first [1]byte
		if _, err := io.ReadFull(req.Body, first[:]); err != nil {
			t.Error(err)
			return
		}
		io.WriteString(conn, "HTTP/1.1 200 Custom Reason\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nfirst\r\n")
		rest, err := io.ReadAll(req.Body)
		if err != nil {
			t.Error(err)
			return
		}
		if string(first[:])+string(rest) != "abcdefghij" {
			t.Errorf("upload = %q%q", first, rest)
		}
		io.WriteString(conn, "5\r\n-last\r\n0\r\n\r\n")
	}()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	switchyard := newServer(newProxy(upstream.Addr().String(), ln.Addr().(*net.TCPAddr), time.Second, testToken), 5*time.Second, 5*time.Second, 0, 16<<10)
	go switchyard.Serve(ln)
	t.Cleanup(func() {
		switchyard.Close()
		<-upstreamDone
	})
	client, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	client.SetDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(client, "POST /upload HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 10\r\n\r\na")
	res, err := http.ReadResponse(bufio.NewReader(client), &http.Request{Method: http.MethodPost})
	if err != nil {
		t.Fatal(err)
	}
	var first [5]byte
	if _, err := io.ReadFull(res.Body, first[:]); err != nil {
		t.Fatal(err)
	}
	io.WriteString(client, "bcdefghij")
	rest, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "200 OK" || string(first[:])+string(rest) != "first-last" {
		t.Errorf("got %q %q%q", res.Status, first, rest)
	}
}

func TestShutdownWaitsForACustomStatusLineResponse(t *testing.T) {
	release := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, buf, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		io.WriteString(buf, "HTTP/1.1 400 Invalid JSON\r\nContent-Length: 10\r\n\r\nfirst")
		buf.Flush()
		<-release
		io.WriteString(conn, "-last")
	}))
	t.Cleanup(upstream.Close)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	switchyard := newServer(newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second, testToken), 0, 0, 0, 16<<10)
	go switchyard.Serve(ln)

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	io.WriteString(conn, get("/"))
	reader := bufio.NewReader(conn)
	res, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatal(err)
	}

	// Drain the way main does, while the body is still streaming.
	stopped := make(chan struct{})
	go func() {
		switchyard.Shutdown(context.Background())
		close(stopped)
	}()
	select {
	case <-stopped:
		t.Fatal("shutdown finished before the response did")
	case <-time.After(200 * time.Millisecond):
	}
	close(release)
	body, _ := io.ReadAll(res.Body)
	if string(body) != "first-last" {
		t.Errorf("body = %q, want the whole response", body)
	}
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("shutdown never finished")
	}
}

func TestClosesAConnectionWhoseHeadersNeverFinish(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	upstreamHit := make(chan struct{}, 1)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { upstreamHit <- struct{}{} })
	switchyard := newServer(handler, 5*time.Second, 200*time.Millisecond, 0, 16<<10)
	go switchyard.Serve(ln)
	t.Cleanup(func() { switchyard.Close() })

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	// Headers without the blank line that ends them.
	io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n")

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	start := time.Now()
	_, err = io.ReadAll(conn)
	if err != nil {
		t.Fatalf("connection not closed by the server: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("closed after %v, want about the 200ms header timeout", elapsed)
	}
	select {
	case <-upstreamHit:
		t.Error("an incomplete request reached the handler")
	default:
	}
}

func TestRequiresEveryFlag(t *testing.T) {
	full := []string{"--listen", ":0", "--upstream", "127.0.0.1:1", "--idle-timeout-ms", "65000", "--header-timeout-ms", "60000", "--request-timeout-ms", "300000", "--upstream-idle-ms", "4000", "--max-header-bytes", "16384"}
	cfg, err := parseConfig(full)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.idleTimeout != 65*time.Second || cfg.headerTimeout != 60*time.Second || cfg.requestTimeout != 300*time.Second || cfg.upstreamIdle != 4*time.Second {
		t.Errorf("parsed %+v", cfg)
	}
	for i := 0; i < len(full); i += 2 {
		without := append(append([]string{}, full[:i]...), full[i+2:]...)
		_, err := parseConfig(without)
		if err == nil || !strings.Contains(err.Error(), full[i]) {
			t.Errorf("without %s: err = %v, want it named", full[i], err)
		}
	}
}

// startServedProxy runs newServer and newProxy as main does, in front of an
// upstream that records the request target and method it receives.
func startServedProxy(t *testing.T, requestTimeout time.Duration) (string, <-chan string) {
	t.Helper()
	seen := make(chan string, 16)
	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.Method + " " + r.RequestURI
		io.Copy(io.Discard, r.Body)
	}))
	// The stand-in for Node is a Go server too: let it pass "OPTIONS *" to
	// the handler, as Node does.
	upstream.Config.DisableGeneralOptionsHandler = true
	upstream.Start()
	t.Cleanup(upstream.Close)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	handler := newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second, testToken)
	switchyard := newServer(handler, 5*time.Second, 5*time.Second, requestTimeout, 16<<10)
	go switchyard.Serve(ln)
	t.Cleanup(func() { switchyard.Close() })
	return ln.Addr().String(), seen
}

func TestForwardsOptionsStarToNode(t *testing.T) {
	addr, seen := startServedProxy(t, 0)
	rawRoundTrip(t, addr, "OPTIONS * HTTP/1.1\r\nHost: shop.example.com\r\nConnection: close\r\n\r\n")
	select {
	case got := <-seen:
		if got != "OPTIONS *" {
			t.Errorf("upstream got %q, want %q", got, "OPTIONS *")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("OPTIONS * never reached the upstream")
	}
}

func TestClosesARequestWhoseBodyNeverFinishes(t *testing.T) {
	for _, head := range []string{
		"OPTIONS * HTTP/1.1",
		"POST /upload HTTP/1.1",
	} {
		t.Run(head, func(t *testing.T) {
			addr, _ := startServedProxy(t, 300*time.Millisecond)
			conn, err := net.Dial("tcp", addr)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			// Headers announce a 10-byte body; only 1 byte ever comes.
			io.WriteString(conn, head+"\r\nHost: shop.example.com\r\nContent-Length: 10\r\n\r\nx")

			conn.SetReadDeadline(time.Now().Add(5 * time.Second))
			start := time.Now()
			answer, err := io.ReadAll(conn)
			if err != nil {
				t.Fatalf("connection not closed by the server: %v", err)
			}
			if elapsed := time.Since(start); elapsed > 3*time.Second {
				t.Errorf("closed after %v, want about the 300ms request timeout", elapsed)
			}
			// Node answers a request that hits its requestTimeout with 408.
			if !strings.HasPrefix(string(answer), "HTTP/1.1 408 Request Timeout\r\n") {
				t.Errorf("answered %q, want 408 Request Timeout", answer)
			}
		})
	}
}

// startSwitchyardFor runs newServer and newProxy as main does, in front of an
// upstream answering with handler.
func startSwitchyardFor(t *testing.T, handler http.HandlerFunc) string {
	t.Helper()
	upstream := httptest.NewServer(handler)
	t.Cleanup(upstream.Close)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	proxy := newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second, testToken)
	switchyard := newServer(proxy, 5*time.Second, 5*time.Second, 0, 16<<10)
	go switchyard.Serve(ln)
	t.Cleanup(func() { switchyard.Close() })
	return ln.Addr().String()
}

// Node can answer while the client is still uploading, for example with a 403
// after reading only the headers. Switchyard must pass that answer on without
// waiting for the rest of the body.
func TestAnswersBeforeTheUploadFinishes(t *testing.T) {
	done := make(chan struct{})
	t.Cleanup(func() { close(done) })
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		// Answer the way Node does, without reading the body, and keep the
		// connection open as Node would while the upload is still coming.
		conn, buf, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		io.WriteString(buf, "HTTP/1.1 403 Forbidden\r\nContent-Length: 6\r\n\r\ndenied")
		buf.Flush()
		<-done
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	// Headers announce a 10-byte body; only 1 byte is sent.
	io.WriteString(conn, "POST /upload HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 10\r\n\r\nx")
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	res, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatalf("no response while the upload was unfinished: %v", err)
	}
	body := make([]byte, 6)
	if _, err := io.ReadFull(res.Body, body); err != nil {
		t.Fatalf("reading the body: %v", err)
	}
	if res.StatusCode != http.StatusForbidden || string(body) != "denied" {
		t.Errorf("got %d %q, want 403 \"denied\"", res.StatusCode, body)
	}
}

// An upstream custom reason phrase must not affect the response trailers.
func TestKeepsTrailersOnACustomStatusLine(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		conn, buf, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		io.WriteString(buf, "HTTP/1.1 400 Custom Reason\r\nTransfer-Encoding: chunked\r\nTrailer: X-Checksum\r\n\r\n"+
			"5\r\nhello\r\n0\r\nX-Checksum: abc123\r\n\r\n")
		buf.Flush()
	})
	res := rawRoundTrip(t, addr, get("/"))
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != "400 Bad Request" || string(body) != "hello" {
		t.Errorf("got %q %q, want \"400 Bad Request\" \"hello\"", res.Status, body)
	}
	if got := res.Trailer.Get("X-Checksum"); got != "abc123" {
		t.Errorf("trailer X-Checksum = %q, want %q", got, "abc123")
	}
}

// HTTP/1.0 allows a request without a Host header. Node must see the public
// address, not Switchyard's connection to Node.
func TestUsesThePublicAddressWhenTheRequestHasNoHost(t *testing.T) {
	addr, seen := startProxy(t, nil)
	rawRoundTrip(t, addr, "GET /health HTTP/1.0\r\n\r\n")
	if got := (<-seen).host; got != addr {
		t.Errorf("Node saw Host %q, want the public address %q", got, addr)
	}
}

// lockedBuffer is a bytes.Buffer safe to write from the server's goroutines.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// A client that leaves before Node answers, like a cancelled prefetch, isn't
// an error worth logging; Node logs nothing either.
func TestLogsNothingWhenTheClientLeavesEarly(t *testing.T) {
	var logged lockedBuffer
	proxyErrorLog.SetOutput(&logged)
	t.Cleanup(func() { proxyErrorLog.SetOutput(os.Stderr) })

	cancelled := make(chan struct{})
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
		close(cancelled)
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	io.WriteString(conn, get("/slow"))
	time.Sleep(100 * time.Millisecond)
	conn.Close()

	select {
	case <-cancelled:
	case <-time.After(5 * time.Second):
		t.Fatal("Node never saw the request cancelled")
	}
	// Give Switchyard's error handler time to run after the cancellation.
	time.Sleep(200 * time.Millisecond)
	if got := logged.String(); got != "" {
		t.Errorf("logged %q, want nothing", got)
	}
}

// Go reads 0 differently from Node for the client idle timeout and the pool
// idle time, so those are refused; 0 header and request timeouts mean no
// limit, as in Node.
func TestRejectsTimeoutsGoWouldReadDifferently(t *testing.T) {
	base := map[string]string{"--listen": ":0", "--upstream": "127.0.0.1:1", "--idle-timeout-ms": "65000", "--header-timeout-ms": "60000", "--request-timeout-ms": "300000", "--upstream-idle-ms": "4000", "--max-header-bytes": "16384"}
	args := func(name, value string) []string {
		var out []string
		for k, v := range base {
			if k == name {
				v = value
			}
			out = append(out, k, v)
		}
		return out
	}
	for _, c := range []struct {
		name, value string
		ok          bool
	}{
		{"--max-header-bytes", "4096", false},
		{"--max-header-bytes", "0", false},
		{"--max-header-bytes", "8192", true},
		{"--idle-timeout-ms", "0", false},
		{"--upstream-idle-ms", "0", false},
		{"--header-timeout-ms", "-1", false},
		{"--request-timeout-ms", "-1", false},
		{"--header-timeout-ms", "0", true},
		{"--request-timeout-ms", "0", true},
	} {
		_, err := parseConfig(args(c.name, c.value))
		if (err == nil) != c.ok {
			t.Errorf("%s %s: err = %v, want ok=%v", c.name, c.value, err, c.ok)
		}
	}
}

// A target in absolute form isn't passed on as sent: Go's server takes the
// Host from the target and drops the client's Host header, and Node gets the
// path. This pins down that known difference from plain next start.
func TestAbsoluteFormTargetReachesNodeAsAPathWithTheTargetsHost(t *testing.T) {
	addr, seen := startProxy(t, nil)
	rawRoundTrip(t, addr, "GET http://other.example/p?q=1 HTTP/1.1\r\nHost: shop.example.com\r\nConnection: close\r\n\r\n")
	got := <-seen
	if got.requestURI != "/p?q=1" || got.host != "other.example" {
		t.Errorf("Node saw %q with Host %q, want %q with Host %q", got.requestURI, got.host, "/p?q=1", "other.example")
	}
}

// When Node answers before the client has finished its upload, the rest of
// the body is still on the connection. Switchyard must close the connection
// after the answer, so those bytes are never read as another request.
func TestClosesTheConnectionAfterAnAnswerThatCameBeforeTheBodyEnded(t *testing.T) {
	done := make(chan struct{})
	t.Cleanup(func() { close(done) })
	seen := make(chan string, 4)
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		seen <- r.RequestURI
		// Answer the way Node does for /_next/static/ misses, without reading
		// the body, and keep the connection open.
		conn, buf, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		io.WriteString(buf, "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot Found")
		buf.Flush()
		<-done
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	// A chunked upload whose last chunk hasn't been sent yet.
	io.WriteString(conn, "POST /_next/static/x HTTP/1.1\r\nHost: shop.example.com\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n")
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	reader := bufio.NewReader(conn)
	res, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatalf("no answer: %v", err)
	}
	io.Copy(io.Discard, res.Body)
	if res.StatusCode != http.StatusNotFound || !res.Close {
		t.Errorf("got %d with Close=%v, want 404 with Connection: close", res.StatusCode, res.Close)
	}
	// What the client sends next must not reach Node as a request.
	io.WriteString(conn, "0\r\n\r\nGET /second HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
	if _, err := reader.ReadByte(); err != io.EOF {
		t.Errorf("connection still open after the answer: err = %v", err)
	}
	<-seen
	select {
	case uri := <-seen:
		t.Errorf("Node got a second request %q from the same connection", uri)
	case <-time.After(200 * time.Millisecond):
	}
}

// An upload Node has read in full doesn't need the connection closed; it
// stays open for the next request, as without Switchyard.
func TestKeepsTheConnectionOpenAfterACompleteUpload(t *testing.T) {
	addr := startSwitchyardFor(t, func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		io.WriteString(w, "ok")
	})
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	reader := bufio.NewReader(conn)
	for i := 0; i < 2; i++ {
		io.WriteString(conn, "POST /upload HTTP/1.1\r\nHost: shop.example.com\r\nContent-Length: 5\r\n\r\nhello")
		res, err := http.ReadResponse(reader, nil)
		if err != nil {
			t.Fatalf("request %d: %v", i+1, err)
		}
		io.Copy(io.Discard, res.Body)
		if res.Close {
			t.Errorf("request %d: connection closed after a complete upload", i+1)
		}
	}
}

// startCountingProxy runs Switchyard in front of an upstream that counts its
// open connections. With a long upstreamIdle, a connection to Node left idle
// would still be open when the test looks.
func startCountingProxy(t *testing.T, upstreamIdle time.Duration) (string, func() int, <-chan received) {
	t.Helper()
	return startCountingProxyWith(t, upstreamIdle, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "ok")
	})
}

func startCountingProxyWith(t *testing.T, upstreamIdle time.Duration, handler http.HandlerFunc) (string, func() int, <-chan received) {
	t.Helper()
	var mu sync.Mutex
	open := 0
	seen := make(chan received, 64)
	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- received{requestURI: r.RequestURI, remoteAddr: r.RemoteAddr, host: r.Host, header: nil}
		handler(w, r)
	}))
	upstream.Config.ConnState = func(_ net.Conn, state http.ConnState) {
		mu.Lock()
		defer mu.Unlock()
		switch state {
		case http.StateNew:
			open++
		case http.StateClosed, http.StateHijacked:
			open--
		}
	}
	upstream.Start()
	t.Cleanup(upstream.Close)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	switchyard := newServer(newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), upstreamIdle, testToken), time.Minute, 5*time.Second, 0, 16<<10)
	go switchyard.Serve(ln)
	t.Cleanup(func() { switchyard.Close() })
	count := func() int {
		mu.Lock()
		defer mu.Unlock()
		return open
	}
	return ln.Addr().String(), count, seen
}

// Each client connection has its own connections to Node, so one that hangs
// up must take its connection to Node with it, instead of leaving it idle in
// a pool no other client can use.
func TestClosesConnectionsToNodeWhenTheirClientsLeave(t *testing.T) {
	addr, openToNode, _ := startCountingProxy(t, time.Minute)
	for i := 0; i < 20; i++ {
		conn, err := net.Dial("tcp", addr)
		if err != nil {
			t.Fatal(err)
		}
		io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
		res, err := http.ReadResponse(bufio.NewReader(conn), nil)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		conn.Close()
	}
	deadline := time.Now().Add(2 * time.Second)
	for openToNode() > 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if n := openToNode(); n > 0 {
		t.Errorf("%d connections to Node still open after all 20 clients left", n)
	}
}

// One client's requests still share one connection to Node, as Node's own
// keep-alive would.
func TestReusesOneConnectionToNodeForOneClient(t *testing.T) {
	addr, openToNode, seen := startCountingProxy(t, time.Minute)
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	reader := bufio.NewReader(conn)
	var upstreamPeers []string
	for i := 0; i < 3; i++ {
		io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
		res, err := http.ReadResponse(reader, nil)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		upstreamPeers = append(upstreamPeers, (<-seen).remoteAddr)
	}
	if upstreamPeers[0] != upstreamPeers[1] || upstreamPeers[1] != upstreamPeers[2] {
		t.Errorf("requests reached Node from %v, want one connection", upstreamPeers)
	}
	if n := openToNode(); n != 1 {
		t.Errorf("%d connections to Node open, want 1", n)
	}
}

// All clients together keep at most maxKeptUpstreams connections to Node
// open between requests. Clients beyond that are still served, but their
// connections to Node close with each response.
func TestCapsConnectionsToNodeKeptAcrossClients(t *testing.T) {
	previous := maxKeptUpstreams
	maxKeptUpstreams = 2
	t.Cleanup(func() { maxKeptUpstreams = previous })
	addr, openToNode, _ := startCountingProxy(t, time.Minute)

	var clients []net.Conn
	t.Cleanup(func() {
		for _, c := range clients {
			c.Close()
		}
	})
	for i := 0; i < 5; i++ {
		conn, err := net.Dial("tcp", addr)
		if err != nil {
			t.Fatal(err)
		}
		clients = append(clients, conn)
		// Keep-alive: each client stays connected after its response.
		io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
		res, err := http.ReadResponse(bufio.NewReader(conn), nil)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		if res.StatusCode != http.StatusOK || res.Close {
			t.Errorf("client %d: got %d with Close=%v, want 200 on a kept connection", i+1, res.StatusCode, res.Close)
		}
	}
	deadline := time.Now().Add(2 * time.Second)
	for openToNode() > 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if n := openToNode(); n > 2 {
		t.Errorf("%d connections to Node open for 5 idle clients, want at most 2", n)
	}
}

// A slot belongs to an open connection to Node, not to a client: when a
// client's connection to Node idles out, its slot is free again for other
// clients, even though the client itself is still connected.
func TestFreesSlotsWhenConnectionsToNodeIdleOut(t *testing.T) {
	previous := maxKeptUpstreams
	maxKeptUpstreams = 2
	t.Cleanup(func() { maxKeptUpstreams = previous })
	addr, openToNode, seen := startCountingProxy(t, 200*time.Millisecond)

	get := func(conn net.Conn, reader *bufio.Reader) string {
		t.Helper()
		io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
		res, err := http.ReadResponse(reader, nil)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		return (<-seen).remoteAddr
	}
	// Two clients take both slots and stay connected.
	for i := 0; i < 2; i++ {
		conn, err := net.Dial("tcp", addr)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn.Close() })
		get(conn, bufio.NewReader(conn))
	}
	// Their connections to Node idle out after upstreamIdle.
	deadline := time.Now().Add(3 * time.Second)
	for openToNode() > 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if n := openToNode(); n > 0 {
		t.Fatalf("%d connections to Node still open after upstreamIdle", n)
	}
	// A third client can keep its connection to Node between requests.
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	reader := bufio.NewReader(conn)
	first, second := get(conn, reader), get(conn, reader)
	if first != second {
		t.Errorf("third client's requests reached Node from %s and %s, want one kept connection", first, second)
	}
}

// Clients that open connections to Node at the same moment can't keep more
// of them between requests than there are slots.
func TestCapsConnectionsToNodeDialedAtOnce(t *testing.T) {
	previous := maxKeptUpstreams
	maxKeptUpstreams = 2
	t.Cleanup(func() { maxKeptUpstreams = previous })
	addr, openToNode, _ := startCountingProxyWith(t, time.Minute, func(w http.ResponseWriter, r *http.Request) {
		// Hold every request long enough that all ten dial before any ends.
		time.Sleep(200 * time.Millisecond)
		io.WriteString(w, "ok")
	})
	var wg sync.WaitGroup
	conns := make([]net.Conn, 10)
	for i := range conns {
		conn, err := net.Dial("tcp", addr)
		if err != nil {
			t.Fatal(err)
		}
		conns[i] = conn
		t.Cleanup(func() { conn.Close() })
		wg.Add(1)
		go func() {
			defer wg.Done()
			io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
			if res, err := http.ReadResponse(bufio.NewReader(conn), nil); err == nil {
				io.Copy(io.Discard, res.Body)
			}
		}()
	}
	wg.Wait()
	deadline := time.Now().Add(2 * time.Second)
	for openToNode() > 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if n := openToNode(); n > 2 {
		t.Errorf("%d connections to Node kept after 10 simultaneous requests, want at most 2", n)
	}
}

// A connection to Node that has been upgraded (to a WebSocket, say) leaves
// HTTP, so it gives its slot back while the tunnel stays open.
func TestUpgradedConnectionsGiveTheirSlotBack(t *testing.T) {
	previous := maxKeptUpstreams
	maxKeptUpstreams = 1
	t.Cleanup(func() { maxKeptUpstreams = previous })
	tunnelDone := make(chan struct{})
	t.Cleanup(func() { close(tunnelDone) })
	addr, _, seen := startCountingProxyWith(t, time.Minute, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") == "" {
			io.WriteString(w, "ok")
			return
		}
		conn, buf, _ := w.(http.Hijacker).Hijack()
		defer conn.Close()
		io.WriteString(buf, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
		buf.Flush()
		<-tunnelDone
	})

	tunnel, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer tunnel.Close()
	io.WriteString(tunnel, "GET /socket HTTP/1.1\r\nHost: shop.example.com\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")
	res, err := http.ReadResponse(bufio.NewReader(tunnel), nil)
	if err != nil || res.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("upgrade: %v %v", res, err)
	}
	<-seen

	// With the tunnel still open, another client can keep its connection.
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	reader := bufio.NewReader(conn)
	var peers []string
	for i := 0; i < 2; i++ {
		io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\n\r\n")
		res, err := http.ReadResponse(reader, nil)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, res.Body)
		peers = append(peers, (<-seen).remoteAddr)
	}
	if peers[0] != peers[1] {
		t.Errorf("requests reached Node from %v while a tunnel was open, want one kept connection", peers)
	}
}

func TestABodyOfKnownLengthFromNodeReachesTheClientChunkByChunk(t *testing.T) {
	sent := make(chan struct{})
	addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "6")
		io.WriteString(w, "abc")
		w.(http.Flusher).Flush()
		<-sent
		io.WriteString(w, "def")
	})
	// Registered after startProxy's cleanups, so it runs before them and
	// frees the handler even when the test fails.
	release := sync.OnceFunc(func() { close(sent) })
	t.Cleanup(release)
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(conn, get("/"))
	res, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	first := make([]byte, 3)
	if _, err := io.ReadFull(res.Body, first); err != nil || string(first) != "abc" {
		t.Fatalf("first chunk %q, %v", first, err)
	}
	release()
	if rest, err := io.ReadAll(res.Body); err != nil || string(rest) != "def" {
		t.Fatalf("rest %q, %v", rest, err)
	}
}
