package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// directFixture is a front with a stub Node and a stub route.go worker.
type directFixture struct {
	addr       string
	front      *front
	workerAddr string
	node       chan *http.Request // requests Node saw
	worker     chan *http.Request
}

const testTable = `{"contract":{"version":1},"basePath":"","maxHeaderBytes":16384,
"compress":true,"nodePrefixes":["/_next/"],"nodeRequestHeaders":["rsc"],
"nodeExact":["/"],"goExact":{"/api/echo":"/api/echo/route"},
"dynamic":[{"path":["api","users",{"param":"id"}],"go":"/api/users/[id]/route"}],
"direct":{"stripRequestHeaders":["x-matched-path"],
"stripRequestHeaderPrefixes":["x-next-internal-"],
"statusText":{"200":"OK","413":"Payload Too Large","500":"Internal Server Error"},
"workerFailedHeader":{"name":"x-next-internal-front-worker-failed","value":"s3cret"}}}`

func startDirect(t *testing.T, worker http.HandlerFunc) *directFixture {
	t.Helper()
	fx := &directFixture{node: make(chan *http.Request, 16), worker: make(chan *http.Request, 16)}
	node := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		r = r.Clone(r.Context())
		r.Body = io.NopCloser(strings.NewReader(string(body)))
		fx.node <- r
		io.WriteString(w, "node")
	}))
	t.Cleanup(node.Close)
	ws := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Next-Internal-Go-Token") != "secret" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		fx.worker <- r.Clone(r.Context())
		worker(w, r)
	}))
	t.Cleanup(ws.Close)
	fx.workerAddr = ws.Listener.Addr().String()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	public := ln.Addr().(*net.TCPAddr)
	fx.front = newFront(newProxy(node.Listener.Addr().String(), public, 4*time.Second), public, 4*time.Second)
	srv := &http.Server{Handler: fx.front}
	go srv.Serve(ln)
	t.Cleanup(func() { srv.Close() })
	fx.addr = ln.Addr().String()

	fx.front.apply(controlMessage{Event: "table", Table: json.RawMessage(testTable)})
	fx.announce(fx.workerAddr, "/api/echo/route", "/api/users/[id]/route")
	return fx
}

func (fx *directFixture) announce(address string, pages ...string) {
	for _, page := range pages {
		fx.front.apply(controlMessage{Event: "worker", Page: page, Network: "tcp",
			Address: address, TokenHeader: "x-next-internal-go-token", Token: "secret"})
	}
}

// raw sends head over a new connection and returns the whole response.
func (fx *directFixture) raw(t *testing.T, head string) string {
	t.Helper()
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	fmt.Fprintf(conn, "%s\r\nHost: example.com\r\nConnection: close\r\n\r\n", head)
	out, _ := io.ReadAll(bufio.NewReader(conn))
	return string(out)
}

func TestDirectRequestReachesTheWorkerAsNodeWouldSendIt(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "go") })
	res := fx.raw(t, "GET /api/users/42?sort=asc HTTP/1.1\r\nX-Matched-Path: /x\r\nX-Next-Internal-Go-Token: forged\r\nX-Custom: kept")
	if !strings.HasSuffix(res, "go") {
		t.Fatalf("response %q", res)
	}
	r := <-fx.worker
	if r.RequestURI != "/api/users/42?sort=asc" || r.Host != "example.com" {
		t.Errorf("target %q host %q", r.RequestURI, r.Host)
	}
	for name, want := range map[string]string{
		"X-Custom": "kept", "X-Matched-Path": "", "X-Forwarded-Host": "example.com",
		"X-Forwarded-Proto": "http", "X-Forwarded-For": "127.0.0.1", "Connection": "keep-alive",
	} {
		if got := r.Header.Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
}

func TestRequestsOutsideTheGateGoToNode(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "go") })
	for _, head := range []string{
		"GET /api/users/42/ HTTP/1.1",
		"GET /api/users/a%20b HTTP/1.1",
		"GET /api/echo HTTP/1.1\r\nAccept-Encoding: gzip",
		"GET /api/echo HTTP/1.1\r\nRsc: 1",
		"GET / HTTP/1.1",
	} {
		if res := fx.raw(t, head); !strings.HasSuffix(res, "node") {
			t.Errorf("%q: %q", head, res)
		}
		<-fx.node
	}
}

func TestFirstRequestGoesToNodeUntilTheWorkerIsAnnounced(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "go") })
	fx.front.apply(controlMessage{Event: "gone", Address: fx.workerAddr})
	if res := fx.raw(t, "GET /api/echo HTTP/1.1"); !strings.HasSuffix(res, "node") {
		t.Fatalf("after gone: %q", res)
	}
	fx.announce(fx.workerAddr, "/api/echo/route")
	if res := fx.raw(t, "GET /api/echo HTTP/1.1"); !strings.HasSuffix(res, "go") {
		t.Fatalf("after worker: %q", res)
	}
}

func TestAWorkerThatCannotBeReachedHandsTheRequestToNode(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {})
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	dead := ln.Addr().String()
	ln.Close()
	fx.announce(dead, "/api/echo/route")
	conn, _ := net.Dial("tcp", fx.addr)
	defer conn.Close()
	fmt.Fprintf(conn, "POST /api/echo HTTP/1.1\r\nHost: example.com\r\nContent-Length: 4\r\nConnection: close\r\n\r\nbody")
	out, _ := io.ReadAll(conn)
	if !strings.HasSuffix(string(out), "node") {
		t.Fatalf("%q", out)
	}
	got := <-fx.node
	body, _ := io.ReadAll(got.Body)
	if got.RequestURI != "/api/echo" || string(body) != "body" || got.Header.Get("X-Next-Internal-Front-Worker-Failed") != "" {
		t.Errorf("Node got %q with body %q", got.RequestURI, body)
	}
}

func TestNodeReasonPhrasesTrailersAndEarlyHints(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("case") {
		case "413":
			w.WriteHeader(http.StatusRequestEntityTooLarge)
		case "extras":
			w.Header().Set("Link", "</a.css>; rel=preload")
			w.WriteHeader(http.StatusEarlyHints)
			w.Header().Set("Trailer", "X-Checksum")
			w.WriteHeader(http.StatusOK)
			io.WriteString(w, "body")
			w.Header().Set("X-Checksum", "abc")
		}
	})
	if res := fx.raw(t, "GET /api/echo?case=413 HTTP/1.1"); !strings.HasPrefix(res, "HTTP/1.1 413 Payload Too Large\r\n") {
		t.Errorf("413: %q", res)
	}
	res := fx.raw(t, "GET /api/echo?case=extras HTTP/1.1")
	if !strings.HasPrefix(res, "HTTP/1.1 200 OK\r\n") {
		t.Errorf("early hints reached the client: %q", res)
	}
	if !strings.Contains(res, "Trailer: X-Checksum\r\n") || strings.Contains(res, "abc") {
		t.Errorf("trailers: %q", res)
	}
	if !strings.Contains(res, "Link: </a.css>; rel=preload\r\n") {
		t.Errorf("link: %q", res)
	}
}

func TestAWorkerFailingBeforeHeadersIsReportedToNode(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) { panic(http.ErrAbortHandler) })
	conn, _ := net.Dial("tcp", fx.addr)
	defer conn.Close()
	fmt.Fprintf(conn, "POST /api/echo?x=1 HTTP/1.1\r\nHost: example.com\r\nContent-Length: 4\r\nConnection: close\r\n\r\nbody")
	out, _ := io.ReadAll(conn)
	if !strings.HasSuffix(string(out), "node") {
		t.Fatalf("%q", out)
	}
	<-fx.worker
	got := <-fx.node
	body, _ := io.ReadAll(got.Body)
	if got.Method != "POST" || got.RequestURI != "/api/echo?x=1" || len(body) != 0 {
		t.Errorf("Node got %s %q with body %q", got.Method, got.RequestURI, body)
	}
	if v := got.Header.Get("X-Next-Internal-Front-Worker-Failed"); v != "s3cret" {
		t.Errorf("failure header %q", v)
	}
}

func TestReadControlSkipsBadLinesAndStopsAtEOF(t *testing.T) {
	var got []string
	var errs int
	readControl(strings.NewReader("{\"event\":\"gone\",\"address\":\"a\"}\nnot json\n{\"event\":\"gone\",\"address\":\"b\"}"),
		func(m controlMessage) { got = append(got, m.Address) },
		func(error) { errs++ })
	if strings.Join(got, ",") != "a,b" || errs != 1 {
		t.Errorf("got %v, %d errors", got, errs)
	}
}
