package main

import (
	"maps"
	"net/http"
	"net/textproto"
	"slices"
	"strings"
	"sync/atomic"

	"github.com/vercel/next.js/packages/next/src/server/switchyard/routing"
)

// switchyard is the public handler. It sends every request to Node, as in
// step 1, and keeps what Node tells it about the app's route.go routes and
// their workers, for sending those requests to a worker directly.
type switchyard struct {
	node http.Handler
	// The current routing state, replaced whole on every control message
	// and read once per request, so a request never sees half an update.
	// apply, which writes it, runs on one goroutine only (readControl).
	state atomic.Pointer[directState]
}

// directState is what Switchyard knows from Node: the route table and the
// workers that are ready.
type directState struct {
	table *routing.Table
	// route id → worker serving it
	workers map[string]*goUpstream
}

// goUpstream is one route.go worker serving one route. A production build's
// worker serves every route and selects one from x-matched-path.
type goUpstream struct {
	address     string
	tokenHeader string
	token       []string // as a header value, set as is on each request
	route       []string // the route ID as the x-matched-path value
}

// matchedPathHeader names the route a worker serves, as the Next.js server
// reads it from Vercel's routing.
const matchedPathHeader = "X-Matched-Path"

// setWorkerHeaders prepares the headers of a request forwarded to up. The
// worker selects its handler from x-matched-path and trusts it once the token
// matches, so every copy the client sent, in any letter case, and every
// x-next-internal-* header is removed before the worker's own values are set.
func (up *goUpstream) setWorkerHeaders(h http.Header) {
	for name := range h {
		lower := strings.ToLower(name)
		if lower == "x-matched-path" || strings.HasPrefix(lower, "x-next-internal-") {
			delete(h, name)
		}
	}
	h[up.tokenHeader] = up.token
	if up.route != nil {
		h[matchedPathHeader] = up.route
	}
}

func newSwitchyard(node http.Handler) *switchyard {
	f := &switchyard{node: node}
	f.state.Store(&directState{workers: map[string]*goUpstream{}})
	return f
}

func (f *switchyard) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.node.ServeHTTP(w, r)
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
			route:       routeValue(msg.Route),
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
			// slices.Contains, not up.token[0], so an entry without a
			// token can't panic the control loop.
			if slices.Contains(up.token, msg.Token) {
				delete(next.workers, route)
			}
		}
	default:
		proxyErrorLog.Printf("unknown control message %q", msg.Event)
		return
	}
	f.state.Store(&next)
}

// routeValue is the x-matched-path value for a worker's route ID, sent as its
// UTF-8 bytes. Every route.go worker has a route ID, including in development,
// where its executable serves one route and ignores x-matched-path. A message
// without one sets no x-matched-path, so the worker selects nothing.
func routeValue(route string) []string {
	if route == "" {
		return nil
	}
	return []string{route}
}

// loadTable reads the route table.
func (s *directState) loadTable(data []byte) error {
	table, err := routing.Load(data)
	if err != nil {
		return err
	}
	s.table = table
	return nil
}
