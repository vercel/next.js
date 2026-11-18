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
	front := newServer(newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second), 0, 0, 0)
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
				fmt.Fprintf(buf, "HTTP/1.1 %s\r\nConnection: Upgrade\r\nUpgrade: front-test\r\n\r\n", status)
				buf.Flush()
				io.Copy(conn, buf)
			})
			conn, err := net.Dial("tcp", addr)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(5 * time.Second))
			io.WriteString(conn, "GET / HTTP/1.1\r\nHost: shop.example.com\r\nConnection: Upgrade\r\nUpgrade: front-test\r\n\r\n")
			reader := bufio.NewReader(conn)
			res, err := http.ReadResponse(reader, nil)
			if err != nil {
				t.Fatal(err)
			}
			if res.Status != status || res.Header.Get("Upgrade") != "front-test" {
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
				front := newServer(newProxy(upstream.Addr().String(), ln.Addr().(*net.TCPAddr), time.Second), 5*time.Second, 5*time.Second, 0)
				go front.Serve(ln)
				t.Cleanup(func() {
					close(release)
					upstream.Close()
					front.Close()
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
	front := newServer(newProxy(upstream.Addr().String(), ln.Addr().(*net.TCPAddr), time.Second), 5*time.Second, 5*time.Second, 0)
	go front.Serve(ln)
	t.Cleanup(func() {
		front.Close()
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
	front := newServer(newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second), 0, 0, 0)
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
	front := newServer(handler, 5*time.Second, 200*time.Millisecond, 0)
	go front.Serve(ln)
	t.Cleanup(func() { front.Close() })

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
	full := []string{"--listen", ":0", "--upstream", "127.0.0.1:1", "--idle-timeout-ms", "65000", "--header-timeout-ms", "60000", "--request-timeout-ms", "300000", "--upstream-idle-ms", "4000"}
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
	handler := newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second)
	front := newServer(handler, 5*time.Second, 5*time.Second, requestTimeout)
	go front.Serve(ln)
	t.Cleanup(func() { front.Close() })
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
			if _, err := io.ReadAll(conn); err != nil {
				t.Fatalf("connection not closed by the server: %v", err)
			}
			if elapsed := time.Since(start); elapsed > 3*time.Second {
				t.Errorf("closed after %v, want about the 300ms request timeout", elapsed)
			}
		})
	}
}

// startFrontFor runs newServer and newProxy as main does, in front of an
// upstream answering with handler.
func startFrontFor(t *testing.T, handler http.HandlerFunc) string {
	t.Helper()
	upstream := httptest.NewServer(handler)
	t.Cleanup(upstream.Close)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	proxy := newProxy(upstream.Listener.Addr().String(), ln.Addr().(*net.TCPAddr), 4*time.Second)
	front := newServer(proxy, 5*time.Second, 5*time.Second, 0)
	go front.Serve(ln)
	t.Cleanup(func() { front.Close() })
	return ln.Addr().String()
}

// Node can answer while the client is still uploading, for example with a 403
// after reading only the headers. The front must pass that answer on without
// waiting for the rest of the body.
func TestAnswersBeforeTheUploadFinishes(t *testing.T) {
	done := make(chan struct{})
	t.Cleanup(func() { close(done) })
	addr := startFrontFor(t, func(w http.ResponseWriter, r *http.Request) {
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
	addr := startFrontFor(t, func(w http.ResponseWriter, r *http.Request) {
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
