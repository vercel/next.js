package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// received is what the stub upstream saw.
type received struct {
	requestURI string
	host       string
	header     http.Header
}

// startProxy runs the proxy in front of an upstream that records each request
// and answers with handler. It returns the proxy's address.
func startProxy(t *testing.T, handler http.HandlerFunc) (string, <-chan received) {
	t.Helper()
	seen := make(chan received, 16)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- received{requestURI: r.RequestURI, host: r.Host, header: r.Header.Clone()}
		if handler != nil {
			handler(w, r)
		}
	}))
	t.Cleanup(upstream.Close)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	front := &http.Server{Handler: newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr))}
	go front.Serve(ln)
	t.Cleanup(func() { front.Close() })
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

func TestKeepsNodesStatusLine(t *testing.T) {
	for _, status := range []string{"400 Invalid JSON", "413 Payload Too Large", "200 OK", "404 Not Found"} {
		t.Run(status, func(t *testing.T) {
			addr, _ := startProxy(t, func(w http.ResponseWriter, r *http.Request) {
				conn, buf, _ := w.(http.Hijacker).Hijack()
				defer conn.Close()
				fmt.Fprintf(buf, "HTTP/1.1 %s\r\nContent-Length: 5\r\nX-Kept: yes\r\n\r\nhello", status)
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
			if res.Status != status || string(body) != "hello" || res.Header.Get("X-Kept") != "yes" {
				t.Errorf("got %q %q %q, want %q hello yes", res.Status, body, res.Header.Get("X-Kept"), status)
			}
		})
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
	front := &http.Server{Handler: newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr))}
	go front.Serve(ln)

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
		front.Shutdown(context.Background())
		hijackedResponses.Wait()
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
