package main

import (
	"maps"
	"net/http"
	"net/textproto"
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

// goUpstream is one route.go worker.
type goUpstream struct {
	address     string
	tokenHeader string
	token       []string // as a header value, set as is on each request
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

// loadTable reads the route table.
func (s *directState) loadTable(data []byte) error {
	table, err := routing.Load(data)
	if err != nil {
		return err
	}
	s.table = table
	return nil
}
