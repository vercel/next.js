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
	"sync"
	"testing"
	"time"
)

// directFixture is Switchyard with a stub Node and a stub route.go worker.
type directFixture struct {
	addr       string
	switchyard *switchyard
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
"mimeTypes":{"application/json":true,"text/plain":true,"image/png":false}}}`

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
	fx.switchyard = newSwitchyard(newProxy(node.Listener.Addr().String(), public, 4*time.Second, testToken), public, 4*time.Second)
	srv := newServer(fx.switchyard, 4*time.Second, time.Minute, time.Minute, 16<<10)
	go srv.Serve(ln)
	t.Cleanup(func() { srv.Close() })
	fx.addr = ln.Addr().String()

	fx.switchyard.apply(controlMessage{Event: "table", Table: json.RawMessage(testTable)})
	fx.announce(fx.workerAddr, "/api/echo/route", "/api/users/[id]/route")
	return fx
}

func (fx *directFixture) announce(address string, pages ...string) {
	for _, page := range pages {
		fx.switchyard.apply(controlMessage{Event: "worker", Page: page,
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
	fx.switchyard.apply(controlMessage{Event: "gone", Address: fx.workerAddr})
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
	if res := fx.raw(t, "GET /api/echo HTTP/1.1"); !strings.HasSuffix(res, "node") {
		t.Fatalf("%q", res)
	}
	got := <-fx.node
	if got.RequestURI != "/api/echo" {
		t.Errorf("Node got %q", got.RequestURI)
	}
	for _, name := range []string{"X-Next-Internal-Go-Token", "X-Forwarded-Host", "X-Forwarded-Proto"} {
		if value := got.Header.Get(name); value != "" {
			t.Errorf("fallback added %s: %q", name, value)
		}
	}
}

func TestAWorkerFailingBeforeHeadersGetsAPlain500(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) { panic(http.ErrAbortHandler) })
	res := fx.raw(t, "GET /api/echo HTTP/1.1")
	if !strings.HasPrefix(res, "HTTP/1.1 500 Internal Server Error\r\n") || !strings.HasSuffix(res, "Internal Server Error") {
		t.Fatalf("%q", res)
	}
	// Node's error page can't be stored by a shared cache; neither can this.
	if !strings.Contains(res, "\r\nCache-Control: private, no-cache, no-store, max-age=0, must-revalidate\r\n") {
		t.Errorf("no Cache-Control like Node's error page: %q", res)
	}
	select {
	case r := <-fx.node:
		t.Errorf("Node got %s, but the worker may have run the request", r.RequestURI)
	default:
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

func TestApplyKeepsTheTableAndWorkersNodeReports(t *testing.T) {
	f := newSwitchyard(http.NotFoundHandler(), &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 3000}, time.Second)
	f.apply(controlMessage{Event: "table", Table: json.RawMessage(`{"contract":{"version":1},"maxHeaderBytes":16384,"goExact":{"/api/echo":"/api/echo/route"}}`)})
	f.apply(controlMessage{Event: "worker", Page: "/api/echo/route",
		Address: "127.0.0.1:51300", TokenHeader: "x-next-internal-go-token", Token: "secret"})
	s := f.state.Load()
	if s.table == nil {
		t.Fatal("no table")
	}
	up := s.workers["/api/echo/route"]
	if up == nil || up.address != "127.0.0.1:51300" || up.tokenHeader != "X-Next-Internal-Go-Token" {
		t.Fatalf("worker %+v", up)
	}

	// A table Switchyard can't read keeps the previous one.
	f.apply(controlMessage{Event: "table", Table: json.RawMessage(`{"contract":{"version":2}}`)})
	if f.state.Load().table != s.table {
		t.Error("an unreadable table replaced the previous one")
	}

	f.apply(controlMessage{Event: "gone", Address: "127.0.0.1:51300"})
	if len(f.state.Load().workers) != 0 {
		t.Errorf("workers after gone: %v", f.state.Load().workers)
	}
	// The state a request already read is unchanged.
	if s.workers["/api/echo/route"] == nil {
		t.Error("gone changed a state a request had already read")
	}
}

func TestABodyOfKnownLengthReachesTheClientChunkByChunk(t *testing.T) {
	sent := make(chan struct{})
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "6")
		io.WriteString(w, "abc")
		w.(http.Flusher).Flush()
		<-sent
		io.WriteString(w, "def")
	})
	// Registered after startDirect's cleanups, so it runs before them and
	// frees the handler even when the test fails.
	release := sync.OnceFunc(func() { close(sent) })
	t.Cleanup(release)
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	fmt.Fprintf(conn, "GET /api/echo HTTP/1.1\r\nHost: example.com\r\n\r\n")
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

func TestBodylessRequestsWithAnIdempotencyKeyGoToNode(t *testing.T) {
	// Go's Transport resends a request whose reused connection closes before
	// a response arrives when it counts the request as replayable, which a
	// bodyless request with an Idempotency-Key is. Node's client never does.
	var mu sync.Mutex
	seen := map[string]int{}
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen[r.Method]++
		mu.Unlock()
		if r.Method != "GET" {
			panic(http.ErrAbortHandler)
		}
	})
	// Leaves an idle connection to the worker for the next request to reuse.
	if res := fx.raw(t, "GET /api/echo HTTP/1.1"); !strings.HasPrefix(res, "HTTP/1.1 200 ") {
		t.Fatalf("%q", res)
	}
	for _, name := range []string{"Idempotency-Key", "X-Idempotency-Key"} {
		fx.raw(t, "POST /api/echo HTTP/1.1\r\n"+name+": k\r\nContent-Length: 0")
	}
	mu.Lock()
	defer mu.Unlock()
	if seen["POST"] > 0 {
		t.Errorf("the worker got the POST %d times, want it to go to Node", seen["POST"])
	}
}
