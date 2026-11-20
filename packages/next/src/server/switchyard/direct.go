package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"net"
	"net/http"
	"net/http/httptrace"
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
// changes on the way to and from a worker, and the workers that are ready.
type directState struct {
	table *routing.Table
	// Request headers Node removes, by canonical name, and prefixes of the
	// canonical names it removes ("X-Next-Internal-").
	strip         map[string]bool
	stripPrefixes []string
	// Compression's MIME database, for the choices Node's compression
	// middleware makes (see compress.go).
	mimeTypes      map[string]bool
	compress       bool
	maxHeaderBytes int64
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
		if msg.Page == "" || msg.Address == "" || msg.TokenHeader == "" || msg.Token == "" {
			proxyErrorLog.Printf("incomplete worker message for page %q", msg.Page)
			return
		}
		next.workers = maps.Clone(next.workers)
		next.workers[msg.Page] = &goUpstream{
			address: msg.Address,
			// The header name as Go keys it, so nothing is converted per
			// request.
			tokenHeader: textproto.CanonicalMIMEHeaderKey(msg.TokenHeader),
			token:       []string{msg.Token},
		}
	case "gone":
		if msg.Token == "" {
			proxyErrorLog.Printf("gone message without a token for %s", msg.Address)
			return
		}
		next.workers = maps.Clone(next.workers)
		// Each worker has its own token. Matching on it, not the address,
		// keeps a late message for an exited worker from removing a new
		// worker that got the same port.
		for route, up := range next.workers {
			if up.token[0] == msg.Token {
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
// that says what Node changes on the way to and from a worker.
func (s *directState) loadTable(data []byte) error {
	table, err := routing.Load(data)
	if err != nil {
		return err
	}
	var raw struct {
		Compress       bool  `json:"compress"`
		MaxHeaderBytes int64 `json:"maxHeaderBytes"`
		Direct         struct {
			StripRequestHeaders        []string        `json:"stripRequestHeaders"`
			StripRequestHeaderPrefixes []string        `json:"stripRequestHeaderPrefixes"`
			MimeTypes                  map[string]bool `json:"mimeTypes"`
		} `json:"direct"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	s.strip = map[string]bool{}
	for _, name := range raw.Direct.StripRequestHeaders {
		s.strip[textproto.CanonicalMIMEHeaderKey(name)] = true
	}
	// Node always removes x-next-internal-* (proxyNativeRequest), so the
	// prefix is stripped even from a table that doesn't list it.
	s.stripPrefixes = []string{"X-Next-Internal-"}
	for _, prefix := range raw.Direct.StripRequestHeaderPrefixes {
		// "x-next-internal-" → "X-Next-Internal-", how Go keys such headers.
		s.stripPrefixes = append(s.stripPrefixes, textproto.CanonicalMIMEHeaderKey(prefix))
	}
	s.mimeTypes = raw.Direct.MimeTypes
	s.compress = raw.Compress
	s.maxHeaderBytes = raw.MaxHeaderBytes
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
	// What Node's compression middleware does with the response body (see
	// compress.go), set from the worker's response headers.
	compress compressMode
	encoding string
	// The status the worker sent, held while compress is compressIfBody
	// and no body has arrived.
	heldStatus int
	// The compressor, once the body is being compressed.
	encoder *encoder
	// Whether the Transport has written the request to a worker, on any
	// attempt. The Transport sends it on its own goroutine.
	sent atomic.Bool
	// Whether any of the body has been written, so Flush has something
	// to send.
	wrote bool
}

func (f *switchyard) serveDirect(w http.ResponseWriter, r *http.Request, s *directState, up *goUpstream) {
	attempt := &directAttempt{ResponseWriter: w, state: s, up: up, request: r}
	ctx := context.WithValue(r.Context(), directAttemptKey{}, attempt)
	// Go's Transport can send a request again on a new connection, so a
	// failed dial doesn't mean no worker got it. The trace records whether
	// any attempt wrote it; a write that failed counts too, since the worker
	// may still have read it.
	ctx = httptrace.WithClientTrace(ctx, &httptrace.ClientTrace{
		WroteRequest: func(httptrace.WroteRequestInfo) { attempt.sent.Store(true) },
	})
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
			setIfMissing(pr.Out.Header, "X-Forwarded-Host", pr.Out.Host)
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
		Transport: nodeHeaderLimitTransport{&http.Transport{
			Proxy:               nil,
			DialContext:         (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			MaxIdleConns:        0,
			MaxIdleConnsPerHost: 512,
			IdleConnTimeout:     upstreamIdle,
			// Node's client doesn't ask the worker for compression either.
			DisableCompression:    true,
			ExpectContinueTimeout: 1 * time.Second,
		}},
		ModifyResponse: func(res *http.Response) error {
			attempt := attemptOf(res.Request.Context())
			attempt.compress, attempt.encoding = planCompression(res, attempt.state)
			// Node passes the worker's Trailer header on but never the trailer
			// fields themselves. The proxy writes the header from the names in
			// res.Trailer, and after the body the fields the Transport put
			// there; trailerDropper clears them first.
			if len(res.Trailer) > 0 {
				res.Body = &trailerDropper{ReadCloser: res.Body, res: res}
			}
			if attempt.compress != compressNone {
				res.Body = &finishingBody{ReadCloser: res.Body, attempt: attempt}
			}
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
			if isDialError(err) && !attempt.sent.Load() && (attempt.body == nil || !attempt.body.read) {
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

// Node's parser counts status text, header names and values, excluding wire
// delimiters. Go's MaxResponseHeaderBytes includes those delimiters, so using
// it would reject responses below Node's limit. Check before ReverseProxy
// removes hop-by-hop headers, and retain Transport's existing raw-byte cap.
type nodeHeaderLimitTransport struct {
	transport *http.Transport
}

func (t nodeHeaderLimitTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	res, err := t.transport.RoundTrip(r)
	if err != nil {
		return nil, err
	}
	attempt := attemptOf(r.Context())
	limit := attempt.state.maxHeaderBytes
	_, statusText, _ := strings.Cut(res.Status, " ")
	size := int64(len(statusText))
	for name, values := range res.Header {
		for _, value := range values {
			size += int64(len(name) + len(value))
		}
	}
	// Transport moves these fields out of Header while parsing the response.
	if len(res.TransferEncoding) > 0 {
		size += int64(len("Transfer-Encoding") + len(strings.Join(res.TransferEncoding, ", ")))
	}
	if len(res.Trailer) > 0 {
		size += int64(len("Trailer") + 2*(len(res.Trailer)-1))
		for name := range res.Trailer {
			size += int64(len(name))
		}
	}
	if size >= limit {
		res.Body.Close()
		return nil, fmt.Errorf("route.go response headers exceed Node's %d-byte limit", limit)
	}
	return res, nil
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

// WriteHeader hides 1xx responses (such as 103 Early Hints) from the client:
// Go's proxy passes them on, Node doesn't.
func (a *directAttempt) WriteHeader(code int) {
	if code >= 100 && code < 200 {
		return
	}
	// The proxy clears the header map after each 1xx response, which also
	// removes the marker that stops Go from guessing a Content-Type.
	if _, ok := a.Header()["Content-Type"]; !ok {
		a.Header()["Content-Type"] = nil
	}
	switch a.compress {
	case compressIfBody:
		a.heldStatus = code
		return
	case compressBody:
		a.startEncoder()
	}
	a.ResponseWriter.WriteHeader(code)
}

// startEncoder sets the headers the middleware sets when it compresses.
func (a *directAttempt) startEncoder() {
	a.Header().Set("Content-Encoding", a.encoding)
	a.Header().Del("Content-Length")
	a.encoder = getEncoder(a.encoding)
}

// Write sends each chunk to the client as soon as the worker sends it, as
// Node's pipe does. The headers wait in Go's buffer until then, so they go
// out with the first chunk, and a one-chunk response in a single write.
// When compressing, it sends what the compressor has written so far, as
// Node's zlib stream does after each chunk.
func (a *directAttempt) Write(p []byte) (int, error) {
	if a.heldStatus != 0 && len(p) > 0 {
		if a.encoding != "" {
			a.startEncoder()
		}
		a.compress = compressNone
		a.ResponseWriter.WriteHeader(a.heldStatus)
		a.heldStatus = 0
	}
	if a.encoder == nil {
		n, err := a.ResponseWriter.Write(p)
		a.wrote = true
		a.Flush()
		return n, err
	}
	a.encoder.w.Write(p)
	if err := a.sendEncoded(); err != nil {
		return 0, err
	}
	return len(p), nil
}

func (a *directAttempt) sendEncoded() error {
	if a.encoder.out.Len() == 0 {
		return nil
	}
	_, err := a.ResponseWriter.Write(a.encoder.out.Bytes())
	a.encoder.out.Reset()
	a.wrote = true
	a.Flush()
	return err
}

// Flush sends what has been written to the client so far. It does nothing
// while the headers are held. In an app without compression it also does
// nothing before the first body byte: Node sends a response's headers with
// its first chunk, or at its end, with Content-Length: 0 when there was no
// body, while the proxy flushes the headers of a response of unknown length
// right away, which would send an empty body chunked. With compression on,
// Node's middleware sends such a response chunked too. It never flushes the
// compressor; the middleware doesn't either.
func (a *directAttempt) Flush() {
	if a.heldStatus != 0 || (!a.wrote && !a.state.compress) {
		return
	}
	if f, ok := a.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// finishingBody calls finish when the proxy closes the worker's response
// body after reading it to the end, which is when Node would end the
// response too. Waiting for the proxy to return would be later: it also
// waits for the client's upload to end. After a failed copy the proxy closes
// the body without having read it to the end, and aborts the response, which
// must then not end as a complete compressed stream.
type finishingBody struct {
	io.ReadCloser
	attempt *directAttempt
	eof     bool
}

func (b *finishingBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	if err == io.EOF {
		b.eof = true
	}
	return n, err
}

func (b *finishingBody) Close() error {
	err := b.ReadCloser.Close()
	if b.eof {
		b.eof = false
		b.attempt.finish()
	}
	return err
}

// finish ends the response once the proxy has copied the whole body.
func (a *directAttempt) finish() {
	if a.heldStatus != 0 {
		// The body was empty: the middleware sends the headers when it ends,
		// before Node could count it, so it goes out chunked.
		a.ResponseWriter.WriteHeader(a.heldStatus)
		a.heldStatus = 0
		a.Flush()
		return
	}
	if a.encoder != nil {
		a.encoder.w.Close()
		a.sendEncoded()
		encoders[a.encoding].Put(a.encoder)
		a.encoder = nil
	}
}

func (a *directAttempt) Unwrap() http.ResponseWriter { return a.ResponseWriter }

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
