package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/vercel/next.js/packages/next/src/server/front/routing"
)

// front is the public handler. Each request goes either to Node, exactly as
// in step 1, or straight to a route.go worker when Node's route table says
// Node would have sent it there unchanged (see the routing package).
//
//	client ──► front ──► Node              (default)
//	               └───► route.go worker   (direct)
type front struct {
	node         http.Handler
	public       *net.TCPAddr
	upstreamIdle time.Duration
	// The current routing state, replaced whole on every control message
	// and read once per request, so a request never sees half an update.
	state atomic.Pointer[directState]
	// Serializes control messages; requests never take it.
	mu sync.Mutex
}

// directState is what the front knows from Node: the route table, how to
// send direct requests, and the workers that are ready.
type directState struct {
	table  *routing.Table
	direct directConfig
	// route id → worker serving it
	workers map[string]*goUpstream
}

// directConfig is the table's "direct" part: what the front strips from a
// direct request and writes on its response, as Node would.
type directConfig struct {
	StripRequestHeaders        []string          `json:"stripRequestHeaders"`
	StripRequestHeaderPrefixes []string          `json:"stripRequestHeaderPrefixes"`
	StatusText                 map[string]string `json:"statusText"`
	// When a worker fails before answering, the request goes to Node with
	// this header; Node then answers with its error page, as when its own
	// call to the worker fails.
	WorkerFailedHeader struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"workerFailedHeader"`
	strip map[string]bool
}

// goUpstream is one route.go worker.
type goUpstream struct {
	address     string
	tokenHeader string
	token       string
	proxy       *httputil.ReverseProxy
	transport   *http.Transport
}

func newFront(node http.Handler, public *net.TCPAddr, upstreamIdle time.Duration) *front {
	f := &front{node: node, public: public, upstreamIdle: upstreamIdle}
	f.state.Store(&directState{workers: map[string]*goUpstream{}})
	return f
}

func (f *front) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if up := f.choose(r); up != nil {
		f.serveDirect(w, r, up)
		return
	}
	f.node.ServeHTTP(w, r)
}

// choose returns the worker that answers r directly, or nil for Node.
func (f *front) choose(r *http.Request) *goUpstream {
	s := f.state.Load()
	if s.table == nil {
		return nil
	}
	d := s.table.Decide(routing.Request{
		Method:        r.Method,
		Target:        r.RequestURI,
		Proto:         r.Proto,
		Header:        r.Header,
		ContentLength: r.ContentLength,
	})
	if d.Route == "" {
		return nil
	}
	// nil until Node has started the route's worker: the first request to a
	// route goes through Node, which starts it and then announces it.
	return s.workers[d.Route]
}

// apply updates the state from one control message.
func (f *front) apply(msg controlMessage) {
	f.mu.Lock()
	defer f.mu.Unlock()
	old := f.state.Load()
	next := &directState{table: old.table, direct: old.direct, workers: make(map[string]*goUpstream, len(old.workers)+1)}
	for route, up := range old.workers {
		next.workers[route] = up
	}
	switch msg.Event {
	case "table":
		table, err := routing.Load(msg.Table)
		if err != nil {
			proxyErrorLog.Printf("route table: %v; sending every request to Node", err)
			return
		}
		var holder struct {
			Direct directConfig `json:"direct"`
		}
		if err := json.Unmarshal(msg.Table, &holder); err != nil {
			proxyErrorLog.Printf("route table: %v; sending every request to Node", err)
			return
		}
		next.direct = holder.Direct
		next.direct.strip = map[string]bool{}
		for _, name := range holder.Direct.StripRequestHeaders {
			next.direct.strip[strings.ToLower(name)] = true
		}
		next.table = table
	case "worker":
		if msg.Network != "tcp" {
			proxyErrorLog.Printf("route.go worker on %q: unsupported network", msg.Network)
			return
		}
		up := f.upstreamAt(old, msg)
		next.workers[msg.Page] = up
	case "gone":
		for route, up := range next.workers {
			if up.address == msg.Address {
				delete(next.workers, route)
				// In-flight requests finish on their connections; idle ones
				// would only fail.
				defer up.transport.CloseIdleConnections()
			}
		}
	default:
		proxyErrorLog.Printf("unknown control message %q", msg.Event)
		return
	}
	f.state.Store(next)
}

// upstreamAt returns the known upstream for the message's worker, or a new
// one. One worker can serve several pages (one Go server for every route.go).
func (f *front) upstreamAt(s *directState, msg controlMessage) *goUpstream {
	for _, up := range s.workers {
		if up.address == msg.Address && up.token == msg.Token {
			return up
		}
	}
	up := &goUpstream{address: msg.Address, tokenHeader: msg.TokenHeader, token: msg.Token}
	up.transport = &http.Transport{
		Proxy:               nil,
		DialContext:         (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		MaxIdleConns:        0,
		MaxIdleConnsPerHost: 512,
		IdleConnTimeout:     f.upstreamIdle,
		// Node's client doesn't ask the worker for compression either.
		DisableCompression:    true,
		ExpectContinueTimeout: 1 * time.Second,
	}
	up.proxy = f.newGoProxy(up)
	return up
}

type directAttemptKey struct{}

// directAttempt follows one direct request, so the error handler knows
// whether the worker could have seen it.
type directAttempt struct {
	state *directState
	body  *guardedBody
	w     http.ResponseWriter
}

func (f *front) serveDirect(w http.ResponseWriter, r *http.Request, up *goUpstream) {
	attempt := &directAttempt{state: f.state.Load(), w: w}
	ctx := context.WithValue(r.Context(), directAttemptKey{}, attempt)
	ctx = context.WithValue(ctx, responseWriterKey{}, w)
	// Node never guesses a Content-Type (see newProxy).
	w.Header()["Content-Type"] = nil
	up.proxy.ServeHTTP(dropInformational{w}, r.WithContext(ctx))
}

// newGoProxy forwards to one worker. The worker must get the request Node
// would have sent it (native-route-proxy.ts), and the client the response
// Node would have written.
func (f *front) newGoProxy(up *goUpstream) *httputil.ReverseProxy {
	publicPort := strconv.Itoa(f.public.Port)
	mapIPv4 := f.public.IP.To4() == nil
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			attempt := pr.In.Context().Value(directAttemptKey{}).(*directAttempt)
			pr.Out.URL.Scheme = "http"
			pr.Out.URL.Host = up.address
			pr.Out.Host = pr.In.Host
			keepRequestTarget(pr.Out, pr.In.RequestURI)
			restoreForwardedHeaders(pr.Out.Header, pr.In.Header)
			// Node removes its internal headers from every request.
			cfg := attempt.state.direct
			for name := range pr.Out.Header {
				lower := strings.ToLower(name)
				if cfg.strip[lower] || hasAnyPrefix(lower, cfg.StripRequestHeaderPrefixes) {
					delete(pr.Out.Header, name)
				}
			}
			// Node fills these from the connection when the client sent
			// none (base-server.ts), before calling the worker.
			setIfMissing(pr.Out.Header, "X-Forwarded-Host", pr.In.Host)
			setIfMissing(pr.Out.Header, "X-Forwarded-Port", publicPort)
			setIfMissing(pr.Out.Header, "X-Forwarded-Proto", "http")
			setIfMissing(pr.Out.Header, "X-Forwarded-For", clientIP(pr.In.RemoteAddr, mapIPv4))
			// Node's client keeps its connections to the worker open and says
			// so; Go's Transport keeps them open without the header.
			pr.Out.Header.Set("Connection", "keep-alive")
			pr.Out.Header.Set(up.tokenHeader, up.token)
			if pr.Out.Body != nil {
				attempt.body = &guardedBody{body: pr.Out.Body}
				pr.Out.Body = attempt.body
			}
		},
		FlushInterval: -1,
		Transport:     up.transport,
		ModifyResponse: func(res *http.Response) error {
			attempt := res.Request.Context().Value(directAttemptKey{}).(*directAttempt)
			// Node passes the worker's Trailer header on but never the trailer
			// fields themselves. Go's Transport moved the header into
			// res.Trailer; put it back as a plain header and drop the fields.
			if len(res.Trailer) > 0 {
				names := make([]string, 0, len(res.Trailer))
				for name := range res.Trailer {
					names = append(names, name)
				}
				res.Header["Trailer"] = []string{strings.Join(names, ", ")}
				res.Trailer = nil
				// The Transport fills res.Trailer again when it reads the end
				// of the body; clear it after that read too.
				res.Body = &trailerDropper{ReadCloser: res.Body, res: res}
			}
			// Node writes its own reason phrase ("413 Payload Too Large"), or
			// "unknown" for a code it doesn't know; Go writes its own.
			text, ok := attempt.state.direct.StatusText[strconv.Itoa(res.StatusCode)]
			if !ok {
				text = "unknown"
			}
			res.Status = fmt.Sprintf("%d %s", res.StatusCode, text)
			return writeCustomStatusLine(res)
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			if errors.Is(err, errResponseWritten) || r.Context().Err() != nil {
				return
			}
			attempt := r.Context().Value(directAttemptKey{}).(*directAttempt)
			// The worker is gone and never saw the request (Node hasn't told
			// us yet): hand it to Node, as if the worker weren't ready.
			if isDialError(err) && (attempt.body == nil || !attempt.body.read) {
				if attempt.body != nil {
					r.Body = attempt.body.body
				}
				f.node.ServeHTTP(attempt.w, r)
				return
			}
			proxyErrorLog.Printf("route.go worker %s: %v", up.address, err)
			f.node.ServeHTTP(attempt.w, workerFailed(r, attempt.state.direct))
		},
		ErrorLog: proxyErrorLog,
	}
}

// workerFailed is the request to hand Node when a worker failed after it may
// have received r: the same request line and headers, no body (the worker
// may have read it), and the header that tells Node the worker failed. Node
// then answers what it answers when its own call to the worker fails.
func workerFailed(r *http.Request, cfg directConfig) *http.Request {
	out := r.Clone(r.Context())
	out.Body = http.NoBody
	out.ContentLength = 0
	out.TransferEncoding = nil
	out.Header.Del("Content-Length")
	out.Header.Set(cfg.WorkerFailedHeader.Name, cfg.WorkerFailedHeader.Value)
	return out
}

func isDialError(err error) bool {
	var op *net.OpError
	return errors.As(err, &op) && op.Op == "dial"
}

func hasAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

// guardedBody is the request body as the Transport sees it. It records
// whether anything was read, and ignores Close, so a request the worker
// never received can still go to Node with its body.
type guardedBody struct {
	body io.ReadCloser
	read bool
}

func (b *guardedBody) Read(p []byte) (int, error) {
	n, err := b.body.Read(p)
	if n > 0 {
		b.read = true
	}
	return n, err
}

func (b *guardedBody) Close() error { return nil }

// dropInformational hides 1xx responses (such as 103 Early Hints) from the
// client: Go's proxy passes them on, Node doesn't.
type dropInformational struct {
	http.ResponseWriter
}

func (d dropInformational) WriteHeader(code int) {
	if code >= 100 && code < 200 && code != http.StatusSwitchingProtocols {
		return
	}
	// The proxy clears the header map after each 1xx response, which also
	// removes the marker that stops Go from guessing a Content-Type.
	if _, ok := d.Header()["Content-Type"]; !ok {
		d.Header()["Content-Type"] = nil
	}
	d.ResponseWriter.WriteHeader(code)
}

func (d dropInformational) Unwrap() http.ResponseWriter { return d.ResponseWriter }

func (d dropInformational) Flush() {
	if f, ok := d.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// trailerDropper clears the response's trailer fields once the body ends, so
// the proxy has none to send on.
type trailerDropper struct {
	io.ReadCloser
	res *http.Response
}

func (t *trailerDropper) Read(p []byte) (int, error) {
	n, err := t.ReadCloser.Read(p)
	if err != nil {
		t.res.Trailer = nil
	}
	return n, err
}
