// Package routing decides which route answers a request, from a route table
// that Next.js builds. It knows nothing about connections, upstreams or how
// a route is served: a host (switchyard, or another server) asks Decide and
// does the serving itself. It imports nothing from net/http, so any HTTP
// implementation can call it.
//
// Today the only decision is whether a request can go straight to a route.go
// handler, skipping Node. Decide says yes only for requests Node would pass to
// that handler unchanged; for everything else it answers "Node".
package routing

import (
	"encoding/json"
	"fmt"
	"net/textproto"
)

// Version is the route table format this package reads.
const Version = 1

// Table is a loaded route table. It is never changed after Load, so one
// Table can serve concurrent calls to Decide.
type Table struct {
	// Why the app gets no direct routes; empty when it does.
	reason         string
	maxHeaderBytes int
	nodePrefixes   []string
	// Request headers (canonical names) whose presence sends a request to
	// Node, because a rule Node runs before routing reads them.
	nodeHeaders []string
	// Exact paths that Node answers: public files, app and pages routes that
	// aren't route.go.
	nodeExact map[string]struct{}
	// Paths answered by a route.go, to its route id. A dynamic route's path
	// (with brackets) can be in here too; no request path matches it.
	goExact map[string]string
}

// tableJSON is the wire format Node writes (see switchyard-route-table.ts).
type tableJSON struct {
	Contract struct {
		Version int `json:"version"`
	} `json:"contract"`
	Reason         string            `json:"reason"`
	MaxHeaderBytes int               `json:"maxHeaderBytes"`
	NodePrefixes   []string          `json:"nodePrefixes"`
	NodeHeaders    []string          `json:"nodeRequestHeaders"`
	NodeExact      []string          `json:"nodeExact"`
	GoExact        map[string]string `json:"goExact"`
}

// Load reads a route table. A table of another version is an error; the
// caller then routes nothing directly.
func Load(data []byte) (*Table, error) {
	var raw tableJSON
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("route table: %w", err)
	}
	if raw.Contract.Version != Version {
		return nil, fmt.Errorf("route table: version %d, want %d", raw.Contract.Version, Version)
	}
	if raw.Reason != "" {
		return &Table{reason: raw.Reason}, nil
	}
	if raw.MaxHeaderBytes <= 0 {
		return nil, fmt.Errorf("route table: maxHeaderBytes must be positive")
	}
	t := &Table{
		maxHeaderBytes: raw.MaxHeaderBytes,
		nodePrefixes:   raw.NodePrefixes,
		nodeHeaders:    make([]string, len(raw.NodeHeaders)),
		nodeExact:      make(map[string]struct{}, len(raw.NodeExact)),
		goExact:        make(map[string]string, len(raw.GoExact)),
	}
	for i, name := range raw.NodeHeaders {
		// "rsc" → "Rsc", how Go's HTTP server keys request headers.
		t.nodeHeaders[i] = textproto.CanonicalMIMEHeaderKey(name)
	}
	for _, p := range raw.NodeExact {
		t.nodeExact[p] = struct{}{}
	}
	for p, route := range raw.GoExact {
		if route == "" {
			return nil, fmt.Errorf("route table: empty route id for %q", p)
		}
		t.goExact[p] = route
	}
	return t, nil
}
