package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"maps"
	"net"
	"net/http"
	"net/http/httputil"
	"net/textproto"
	"strings"
	"sync/atomic"
	"time"

	"github.com/vercel/next.js/packages/next/src/server/switchyard/routing"
)

// switchyard is the public handler. Each request goes either to Node, exactly
// as in step 1, or straight to a route.go worker when Node's route table says
// Node would have sent it there unchanged (see the routing package).
//
//	client ──► switchyard ──► Node              (default)
//	                    └───► route.go worker   (direct)
type switchyard struct {
	node http.Handler
	// Forwards direct requests, to whichever worker the request's
	// directAttempt names.
	direct *httputil.ReverseProxy
	// The current routing state, replaced whole on every control message
	// and read once per request, so a request never sees half an update.
	// apply, which writes it, runs on one goroutine only (readControl).
	state atomic.Pointer[directState]
}

// directState is what Switchyard knows from Node: the route table, what Node
// changes on the way to a worker, and the workers that are ready.
type directState struct {
	table *routing.Table
	// Request headers Node removes, by canonical name, and prefixes of the
	// canonical names it removes ("X-Next-Internal-").
	strip         map[string]bool
	stripPrefixes []string
	// route id → worker serving it
	workers map[string]*goUpstream
}

// goUpstream is one route.go worker.
type goUpstream struct {
	address     string
	tokenHeader string
	token       []string // as a header value, set as is on each request
}

func newSwitchyard(node http.Handler, public *net.TCPAddr, upstreamIdle time.Duration) *switchyard {
	f := &switchyard{node: node}
	f.direct = f.newDirectProxy(public, upstreamIdle)
	f.state.Store(&directState{workers: map[string]*goUpstream{}})
	return f
}

func (f *switchyard) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s := f.state.Load()
	if up := s.choose(r); up != nil {
		f.serveDirect(w, r, s, up)
		return
	}
	f.node.ServeHTTP(w, r)
}

// choose returns the worker that answers r directly, or nil for Node.
func (s *directState) choose(r *http.Request) *goUpstream {
	if s.table == nil {
		return nil
	}
	d := s.table.Decide(routing.Request{
		Method:        r.Method,
		Target:        r.RequestURI,
		Proto:         r.Proto,
		Host:          r.Host,
		Header:        r.Header,
		ContentLength: r.ContentLength,
	})
	// A route's worker is missing until Node has started it: the first
	// request to a route goes through Node, which starts it and then
	// announces it.
	return s.workers[d.Route]
}

// apply updates the state from one control message.
func (f *switchyard) apply(msg controlMessage) {
	next := *f.state.Load()
	switch msg.Event {
	case "table":
		if err := next.loadTable(msg.Table); err != nil {
			proxyErrorLog.Printf("route table: %v; sending every request to Node", err)
			return
		}
	case "worker":
		next.workers = maps.Clone(next.workers)
		next.workers[msg.Page] = &goUpstream{
			address: msg.Address,
			// The header name as Go keys it, so nothing is converted per
			// request.
			tokenHeader: textproto.CanonicalMIMEHeaderKey(msg.TokenHeader),
			token:       []string{msg.Token},
		}
	case "gone":
		next.workers = maps.Clone(next.workers)
		for route, up := range next.workers {
			if up.address == msg.Address {
				delete(next.workers, route)
			}
		}
	default:
		proxyErrorLog.Printf("unknown control message %q", msg.Event)
		return
	}
	f.state.Store(&next)
}

// loadTable reads the route table: the routing part, and the "direct" part
// that says what Node changes on the way to a worker.
func (s *directState) loadTable(data []byte) error {
	table, err := routing.Load(data)
	if err != nil {
		return err
	}
	var raw struct {
		Direct struct {
			StripRequestHeaders        []string `json:"stripRequestHeaders"`
			StripRequestHeaderPrefixes []string `json:"stripRequestHeaderPrefixes"`
		} `json:"direct"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	s.strip = map[string]bool{}
	for _, name := range raw.Direct.StripRequestHeaders {
		s.strip[textproto.CanonicalMIMEHeaderKey(name)] = true
	}
	s.stripPrefixes = nil
	for _, prefix := range raw.Direct.StripRequestHeaderPrefixes {
		// "x-next-internal-" → "X-Next-Internal-", how Go keys such headers.
		s.stripPrefixes = append(s.stripPrefixes, textproto.CanonicalMIMEHeaderKey(prefix))
	}
	s.table = table
	return nil
}

// keepAlive is the Connection header Node's client sends the worker; Go's
// Transport keeps connections open without it.
var keepAlive = []string{"keep-alive"}

type directAttemptKey struct{}

// directAttempt follows one direct request through the proxy. It is also
// the ResponseWriter the proxy writes to, wrapping the client's, so the
// client gets the response as Node would write it (WriteHeader and Write
// below).
type directAttempt struct {
	http.ResponseWriter
	state *directState
	up    *goUpstream
	// The request as the client sent it, for handing it to Node.
	request *http.Request
	// The request body as the Transport sees it, so the error handler knows
	// whether the worker could have seen the request.
	body *guardedBody
}

func (f *switchyard) serveDirect(w http.ResponseWriter, r *http.Request, s *directState, up *goUpstream) {
	attempt := &directAttempt{ResponseWriter: w, state: s, up: up, request: r}
	ctx := context.WithValue(r.Context(), directAttemptKey{}, attempt)
	// Node never guesses a Content-Type (see newProxy).
	w.Header()["Content-Type"] = nil
	// As in newProxy: Node's proxy to the worker lets the worker answer while
	// the client is still uploading; Go's server doesn't unless asked.
	_ = http.NewResponseController(w).EnableFullDuplex()
	out := r.WithContext(ctx)
	if r.ContentLength != 0 && r.Body != nil && r.Body != http.NoBody {
		// As in newProxy: track whether the body is read to its end before
		// the worker answers, and whether reading it hit the request timeout.
		body := newRequestBody(r.Body)
		out = r.WithContext(context.WithValue(ctx, requestBodyKey{}, body))
		out.Body = body
	}
	f.direct.ServeHTTP(attempt, out)
}

func attemptOf(ctx context.Context) *directAttempt {
	return ctx.Value(directAttemptKey{}).(*directAttempt)
}

// newDirectProxy forwards to route.go workers. The worker must get the
// request Node would have sent it, and the client the response Node would
// have written.
func (f *switchyard) newDirectProxy(public *net.TCPAddr, upstreamIdle time.Duration) *httputil.ReverseProxy {
	fw := newForwarding(public)
	return &httputil.ReverseProxy{
		// Node builds a worker's request in three places; Rewrite does the
		// same in one. The client's Host, target and forwarded headers, and
		// X-Forwarded-For and -Port, as for requests to Node (forwarding).
		Rewrite: func(pr *httputil.ProxyRequest) {
			attempt := attemptOf(pr.In.Context())
			fw.rewrite(pr)
			pr.Out.URL.Host = attempt.up.address
			// Node removes its internal headers from every request
			// (filterInternalHeaders in server-ipc/utils.ts, called from
			// router-server.ts), and proxyNativeRequest
			// (native-route-proxy.ts) also drops x-next-internal-*. Go's
			// proxy already drops hop-by-hop headers, as proxyNativeRequest
			// does.
			for name := range pr.Out.Header {
				if attempt.state.strip[name] || hasAnyPrefix(name, attempt.state.stripPrefixes) {
					delete(pr.Out.Header, name)
				}
			}
			// Node also fills these when the client sent none
			// (base-server.ts, where it updates the x-forwarded-* headers).
			setIfMissing(pr.Out.Header, "X-Forwarded-Host", pr.In.Host)
			setIfMissing(pr.Out.Header, "X-Forwarded-Proto", "http")
			// proxyNativeRequest sends the worker keep-alive and its token.
			pr.Out.Header["Connection"] = keepAlive
			pr.Out.Header[attempt.up.tokenHeader] = attempt.up.token
			if pr.Out.Body != nil {
				attempt.body = &guardedBody{body: pr.Out.Body}
				pr.Out.Body = attempt.body
			}
		},
		// directAttempt.Write flushes after every write, as Node does.
		FlushInterval: 0,
		// One Transport for every worker: it keeps idle connections per
		// address.
		//
		// Known difference from Node: when a reused connection closes before
		// the worker answers, Go's Transport sends a bodyless GET, HEAD,
		// OPTIONS or TRACE request again on a new connection. Node's client
		// (native-route-proxy.ts) never resends; the request fails and Node
		// answers its error page. So a GET handler that does its work and
		// then crashes can run twice here. Requests Go would also resend for
		// their Idempotency-Key header go to Node (routing.headersNodeHandles).
		Transport: &http.Transport{
			Proxy:               nil,
			DialContext:         (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			MaxIdleConns:        0,
			MaxIdleConnsPerHost: 512,
			IdleConnTimeout:     upstreamIdle,
			// Node's client doesn't ask the worker for compression either.
			DisableCompression:    true,
			ExpectContinueTimeout: 1 * time.Second,
		},
		ModifyResponse: func(res *http.Response) error {
			// As in newProxy: after an answer sent mid-upload, the rest of the
			// body is still on the client connection; don't reuse it.
			if body, ok := res.Request.Context().Value(requestBodyKey{}).(*requestBody); ok && !body.readToEnd.Load() {
				res.Header.Set("Connection", "close")
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			attempt := attemptOf(r.Context())
			if r.Context().Err() != nil {
				// Go's server cancels the request when the client's upload
				// hits the request timeout. Answer that as Node does, as in
				// newProxy: 408, and close the connection, since the rest of
				// the body is still on it. Any other cancellation means the
				// client went away, and nobody reads an answer.
				if body, ok := r.Context().Value(requestBodyKey{}).(*requestBody); ok && body.timedOut() {
					attempt.Header().Set("Connection", "close")
					attempt.WriteHeader(http.StatusRequestTimeout)
				}
				return
			}
			// The worker is gone and never saw the request (Node hasn't told
			// us yet): hand it to Node, as if the worker weren't ready.
			if isDialError(err) && (attempt.body == nil || !attempt.body.read) {
				f.node.ServeHTTP(attempt.ResponseWriter, attempt.request)
				return
			}
			// As in newProxy: part of the body may still be unread, and Go's
			// server, in full-duplex mode, would read it as the next request.
			if r.ContentLength != 0 {
				attempt.Header().Set("Connection", "close")
			}
			proxyErrorLog.Printf("route.go worker %s: %v", attempt.up.address, err)
			// TODO: answer with Node's error page, as without Switchyard. Node
			// renders that page per request, so Switchyard would have to hand
			// the request back to Node together with a report that the worker
			// failed, which Node must be able to trust is from Switchyard.
			// Until then the client gets a plain 500 here, where Node sends
			// its error page.
			writeInternalError(attempt.ResponseWriter)
		},
		ErrorLog: proxyErrorLog,
	}
}

// writeInternalError is Switchyard's own answer when a worker fails after it
// may have received the request: a plain 500, with the Cache-Control Node's
// error page has, so no shared cache keeps it.
func writeInternalError(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusInternalServerError)
	io.WriteString(w, "Internal Server Error")
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

// WriteHeader writes the status line and headers.
func (a *directAttempt) WriteHeader(code int) {
	// The proxy clears the header map after each 1xx response, which also
	// removes the marker that stops Go from guessing a Content-Type.
	if _, ok := a.Header()["Content-Type"]; !ok {
		a.Header()["Content-Type"] = nil
	}
	a.ResponseWriter.WriteHeader(code)
}

// Write sends each chunk to the client as soon as the worker sends it, as
// Node's pipe does. The headers wait in Go's buffer until then, so they go
// out with the first chunk, and a one-chunk response in a single write.
func (a *directAttempt) Write(p []byte) (int, error) {
	n, err := a.ResponseWriter.Write(p)
	a.Flush()
	return n, err
}

// Flush sends what has been written to the client so far.
func (a *directAttempt) Flush() {
	if f, ok := a.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (a *directAttempt) Unwrap() http.ResponseWriter { return a.ResponseWriter }
