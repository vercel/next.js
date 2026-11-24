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
	"sync/atomic"
	"testing"
	"time"

	"github.com/klauspost/compress/gzhttp"
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
	return startDirectWithTimeout(t, worker, time.Minute)
}

// startDirectWithTimeout is startDirect with the given request timeout.
func startDirectWithTimeout(t *testing.T, worker http.HandlerFunc, requestTimeout time.Duration) *directFixture {
	t.Helper()
	fx := &directFixture{node: make(chan *http.Request, 16), worker: make(chan *http.Request, 16)}
	node := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		r = r.Clone(r.Context())
		r.Body = io.NopCloser(strings.NewReader(string(body)))
		fx.node <- r
		if r.URL.Query().Has("big") {
			// A compressible answer Node chose not to compress.
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-transform")
			io.WriteString(w, strings.Repeat("n", 2048))
			return
		}
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
	srv := newServer(fx.switchyard, 4*time.Second, time.Minute, requestTimeout, 16<<10)
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
	fx.switchyard.apply(controlMessage{Event: "gone", Address: fx.workerAddr, Token: "secret"})
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
	for _, c := range []struct{ request, body string }{
		{"GET /api/echo HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n", ""},
		{"POST /api/echo HTTP/1.1\r\nHost: example.com\r\nContent-Length: 4\r\nConnection: close\r\n\r\nbody", "body"},
	} {
		conn, err := net.Dial("tcp", fx.addr)
		if err != nil {
			t.Fatal(err)
		}
		conn.SetDeadline(time.Now().Add(5 * time.Second))
		io.WriteString(conn, c.request)
		out, err := io.ReadAll(conn)
		conn.Close()
		if err != nil || !strings.HasSuffix(string(out), "node") {
			t.Fatalf("%q: %q, %v", c.request, out, err)
		}
		got := <-fx.node
		body, _ := io.ReadAll(got.Body)
		if got.RequestURI != "/api/echo" || string(body) != c.body {
			t.Errorf("Node got %q with body %q", got.RequestURI, body)
		}
		for _, name := range []string{"X-Next-Internal-Go-Token", "X-Forwarded-Host", "X-Forwarded-Proto"} {
			if value := got.Header.Get(name); value != "" {
				t.Errorf("fallback added %s: %q", name, value)
			}
		}
	}
}

// Node already chose whether to compress its answer, and adds its own Vary:
// the compressor around the direct path leaves both alone.
func TestNodesAnswerToAHandedBackRequestIsNotRecompressed(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {})
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	dead := ln.Addr().String()
	ln.Close()
	fx.announce(dead, "/api/echo/route")
	res := fx.raw(t, "GET /api/echo?big=1 HTTP/1.1\r\nAccept-Encoding: gzip")
	<-fx.node
	if strings.Contains(res, "Content-Encoding") || strings.Contains(res, "Vary") || strings.Contains(res, gzhttp.HeaderNoCompression) {
		t.Fatalf("Node's answer was changed: %q", res)
	}
	if !strings.HasSuffix(res, strings.Repeat("n", 2048)) {
		t.Fatalf("body %q", res)
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
	readControl(strings.NewReader("{\"event\":\"gone\",\"address\":\"a\",\"token\":\"t\"}\nnot json\n{\"event\":\"gone\",\"address\":\"b\",\"token\":\"t\"}"),
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

	// A late gone for an earlier worker that had the same port leaves this
	// one in place.
	f.apply(controlMessage{Event: "gone", Address: "127.0.0.1:51300", Token: "earlier"})
	if f.state.Load().workers["/api/echo/route"] == nil {
		t.Fatal("a gone for another worker's token removed this one")
	}

	f.apply(controlMessage{Event: "gone", Address: "127.0.0.1:51300", Token: "secret"})
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

func TestADirectResponseCanArriveBeforeTheUploadFinishes(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		// The stand-in for the worker answers after the first body byte, then
		// reads the rest of the upload, as a route.go behind Node can.
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
		io.WriteString(w, "first")
		controller.Flush()
		rest, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("reading the rest of the upload: %v", err)
		}
		io.WriteString(w, "-"+string(rest))
	})
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(conn, "POST /api/echo HTTP/1.1\r\nHost: example.com\r\nContent-Length: 4\r\n\r\na")
	reader := bufio.NewReader(conn)
	res, err := http.ReadResponse(reader, &http.Request{Method: http.MethodPost})
	if err != nil {
		t.Fatalf("response before the upload finished: %v", err)
	}
	defer res.Body.Close()
	var first [5]byte
	if _, err := io.ReadFull(res.Body, first[:]); err != nil || string(first[:]) != "first" {
		t.Fatalf("first chunk %q, %v", first, err)
	}
	// Only now send the rest of the body.
	io.WriteString(conn, "bcd")
	rest, err := io.ReadAll(res.Body)
	if err != nil || string(rest) != "-bcd" {
		t.Fatalf("rest %q, %v", rest, err)
	}
}

func TestADirectAnswerSentMidUploadClosesTheConnection(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		// The worker answers without reading the rest of the body (the
		// stand-in has to allow that, as a route.go behind Node can).
		controller := http.NewResponseController(w)
		if err := controller.EnableFullDuplex(); err != nil {
			t.Error(err)
		}
		w.WriteHeader(http.StatusForbidden)
		controller.Flush()
	})
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(conn, "POST /api/echo HTTP/1.1\r\nHost: example.com\r\nContent-Length: 10\r\n\r\na")
	res, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: http.MethodPost})
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	// The rest of the body is still on the connection; reusing it would read
	// those bytes as the next request.
	if res.StatusCode != http.StatusForbidden || !res.Close {
		t.Fatalf("status %d, close %v", res.StatusCode, res.Close)
	}
}

func TestADirectUploadThatHitsTheRequestTimeoutGets408(t *testing.T) {
	fx := startDirectWithTimeout(t, func(w http.ResponseWriter, r *http.Request) {
		io.ReadAll(r.Body)
		io.WriteString(w, "worker")
	}, 300*time.Millisecond)
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	// Headers announce a 10-byte body; only 1 byte ever comes.
	io.WriteString(conn, "POST /api/echo HTTP/1.1\r\nHost: example.com\r\nContent-Length: 10\r\n\r\nx")
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	answer, err := io.ReadAll(conn)
	if err != nil {
		t.Fatalf("connection not closed by the server: %v", err)
	}
	// Node answers a request that hits its requestTimeout with 408.
	if !strings.HasPrefix(string(answer), "HTTP/1.1 408 Request Timeout\r\n") {
		t.Errorf("answered %q, want 408 Request Timeout", answer)
	}
	select {
	case <-fx.worker:
	default:
		t.Error("the upload went to Node, want the worker")
	}
}

func TestAnEmptyHostGetsTheForwardedHostNodeWouldSend(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "go") })
	conn, err := net.Dial("tcp", fx.addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	io.WriteString(conn, "GET /api/echo HTTP/1.1\r\nHost:\r\nConnection: close\r\n\r\n")
	io.ReadAll(conn)
	r := <-fx.worker
	// Through Node, Switchyard's public host replaces the empty Host, and
	// Node fills X-Forwarded-Host with it.
	if r.Host == "" || r.Header.Get("X-Forwarded-Host") != r.Host {
		t.Errorf("Host %q, X-Forwarded-Host %q", r.Host, r.Header.Get("X-Forwarded-Host"))
	}
}

func TestAnEmptyBodyOfUnknownLengthGetsContentLengthZero(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		// Sends the headers chunked, then no body.
		w.(http.Flusher).Flush()
	})
	// Node sends the headers with the first chunk or at the end, so an
	// empty body goes out with Content-Length: 0. With compression on,
	// Node's middleware sends it chunked instead; through gzhttp it gets
	// Content-Length: 0 too.
	for _, compress := range []string{`"compress":true`, `"compress":false`} {
		fx.switchyard.apply(controlMessage{Event: "table", Table: json.RawMessage(strings.Replace(testTable, `"compress":true`, compress, 1))})
		res := fx.raw(t, "GET /api/echo HTTP/1.1\r\nAccept-Encoding: gzip")
		if !strings.Contains(res, "\r\nContent-Length: 0\r\n") || strings.Contains(res, "chunked") {
			t.Errorf("%s: response %q", compress, res)
		}
	}
}

// When a reused connection closes after the worker read the request, Go's
// Transport sends a GET again on a new connection. If the worker is gone by
// then, that dial fails, but the worker already handled the request: it must
// not run again in Node.
func TestARequestTheWorkerAlreadyGotIsNotHandedToNode(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	worker := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			io.WriteString(w, "go")
			return
		}
		// The worker exits after reading the request, before answering.
		ln.Close()
		conn, _, _ := w.(http.Hijacker).Hijack()
		conn.Close()
	})}
	go worker.Serve(ln)
	t.Cleanup(func() { worker.Close() })
	fx.announce(ln.Addr().String(), "/api/echo/route")

	if res := fx.raw(t, "GET /api/echo HTTP/1.1"); !strings.HasSuffix(res, "go") {
		t.Fatalf("first response %q", res)
	}
	res := fx.raw(t, "GET /api/echo HTTP/1.1")
	if !strings.HasPrefix(res, "HTTP/1.1 500 ") {
		t.Errorf("second response %q", res)
	}
	select {
	case got := <-fx.node:
		t.Errorf("Node ran %s after the worker had it", got.RequestURI)
	default:
	}
	if n := calls.Load(); n != 2 {
		t.Errorf("worker saw %d requests, want 2", n)
	}
}

func TestNodesInternalHeadersAreStrippedWithoutATableDirectBlock(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "go") })
	fx.switchyard.apply(controlMessage{Event: "table", Table: json.RawMessage(`{"contract":{"version":1},"maxHeaderBytes":16384,"goExact":{"/api/echo":"/api/echo/route"}}`)})
	fx.raw(t, "GET /api/echo HTTP/1.1\r\nX-Next-Internal-Forged: 1")
	if got := (<-fx.worker).Header.Get("X-Next-Internal-Forged"); got != "" {
		t.Errorf("worker got X-Next-Internal-Forged: %q", got)
	}
}

func TestApplyIgnoresIncompleteWorkerMessages(t *testing.T) {
	f := newSwitchyard(http.NotFoundHandler(), &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 3000}, time.Second)
	complete := controlMessage{Event: "worker", Page: "/api/echo/route",
		Address: "127.0.0.1:51300", TokenHeader: "x-next-internal-go-token", Token: "secret"}
	for _, drop := range []func(*controlMessage){
		func(m *controlMessage) { m.Page = "" },
		func(m *controlMessage) { m.Address = "" },
		func(m *controlMessage) { m.TokenHeader = "" },
		func(m *controlMessage) { m.Token = "" },
	} {
		msg := complete
		drop(&msg)
		f.apply(msg)
	}
	if len(f.state.Load().workers) != 0 {
		t.Errorf("workers from incomplete messages: %v", f.state.Load().workers)
	}
	f.apply(complete)
	f.apply(controlMessage{Event: "gone", Address: "127.0.0.1:51300"})
	if f.state.Load().workers["/api/echo/route"] == nil {
		t.Error("a gone without a token removed a worker")
	}
}

func TestApplyGoneSkipsWorkersWithoutAToken(t *testing.T) {
	f := newSwitchyard(http.NotFoundHandler(), &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 3000}, time.Second)
	f.state.Store(&directState{workers: map[string]*goUpstream{
		"/api/echo/route": {address: "127.0.0.1:51300"},
	}})
	f.apply(controlMessage{Event: "gone", Address: "127.0.0.1:51300", Token: "secret"})
	if f.state.Load().workers["/api/echo/route"] == nil {
		t.Error("a gone removed a worker with no token")
	}
}

func TestDirectCompressionVary(t *testing.T) {
	fx := startDirect(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Vary", "Origin")
		if r.URL.Query().Get("case") == "no-transform" {
			w.Header().Add("Cache-Control", "public")
			w.Header().Add("Cache-Control", "no-transform")
		}
		// Above the 1 KiB threshold, so only no-transform keeps it as it is.
		io.WriteString(w, `{"padding":"`+strings.Repeat("x", 2048)+`"}`)
	})
	// gzhttp adds its Vary as a line of its own, where Node's middleware
	// writes one line, "Origin, Accept-Encoding": the same to a cache.
	res := fx.raw(t, "GET /api/echo HTTP/1.1\r\nAccept-Encoding: gzip")
	if !strings.Contains(res, "Content-Encoding: gzip\r\n") || !strings.Contains(res, "Vary: Accept-Encoding\r\n") || !strings.Contains(res, "Vary: Origin\r\n") {
		t.Fatalf("Vary lines: %q", res)
	}
	res = fx.raw(t, "GET /api/echo?case=no-transform HTTP/1.1\r\nAccept-Encoding: gzip")
	if strings.Contains(res, "Content-Encoding") || strings.Contains(res, gzhttp.HeaderNoCompression) {
		t.Fatalf("ignored no-transform in repeated Cache-Control: %q", res)
	}
}
