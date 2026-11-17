// Package routing decides which route answers a request, from a route table
// that Next.js builds. It knows nothing about connections, upstreams or how
// a route is served: a host (next-front, or another server) asks Decide and
// does the serving itself. It imports nothing from net/http, so any HTTP
// implementation can call it.
//
// Today the only decision is whether a request can go straight to a route.go
// handler, skipping Node. Decide says yes only for requests Node would pass to
// that handler unchanged; for everything else it answers "Node".
package routing

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// Version is the route table format this package reads.
const Version = 1

// Table is a loaded route table. It is never changed after Load, so one
// Table can serve concurrent calls to Decide.
type Table struct {
	// Why the app gets no direct routes; empty when it does.
	reason         string
	basePath       string
	maxHeaderBytes int
	compress       bool
	nodePrefixes   []string
	// Request headers (canonical names) whose presence sends a request to
	// Node, because a rule Node runs before routing reads them.
	nodeHeaders []string
	// Exact paths (basePath removed) that Node answers: public files, app
	// and pages routes that aren't route.go.
	nodeExact map[string]struct{}
	// Exact paths answered by a static route.go, to its route id.
	goExact map[string]string
	// Dynamic routes in Node's order; the first match wins.
	dynamic []dynamicRoute
}

type dynamicRoute struct {
	path []entry
	// The route.go route id, or "" for a route Node answers.
	route string
}

type entryKind int

const (
	literal      entryKind = iota // one segment equal to text
	param                         // [name]: one non-empty segment
	rest                          // [...name]: one or more segments
	optionalRest                  // [[...name]]: zero or more segments
)

type entry struct {
	kind entryKind
	text string // the literal; unused for the other kinds
}

// tableJSON is the wire format Node writes (see front-route-table.ts).
type tableJSON struct {
	Contract struct {
		Version int `json:"version"`
	} `json:"contract"`
	Reason         string            `json:"reason"`
	BasePath       string            `json:"basePath"`
	MaxHeaderBytes int               `json:"maxHeaderBytes"`
	Compress       bool              `json:"compress"`
	NodePrefixes   []string          `json:"nodePrefixes"`
	NodeHeaders    []string          `json:"nodeRequestHeaders"`
	NodeExact      []string          `json:"nodeExact"`
	GoExact        map[string]string `json:"goExact"`
	Dynamic        []struct {
		Path []json.RawMessage `json:"path"`
		Go   string            `json:"go"`
	} `json:"dynamic"`
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
	if raw.BasePath != "" && (!strings.HasPrefix(raw.BasePath, "/") || strings.HasSuffix(raw.BasePath, "/")) {
		return nil, fmt.Errorf("route table: invalid basePath %q", raw.BasePath)
	}
	if raw.MaxHeaderBytes <= 0 {
		return nil, fmt.Errorf("route table: maxHeaderBytes must be positive")
	}
	t := &Table{
		basePath:       raw.BasePath,
		maxHeaderBytes: raw.MaxHeaderBytes,
		compress:       raw.Compress,
		nodePrefixes:   raw.NodePrefixes,
		nodeHeaders:    canonicalNames(raw.NodeHeaders),
		nodeExact:      make(map[string]struct{}, len(raw.NodeExact)),
		goExact:        make(map[string]string, len(raw.GoExact)),
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
	for i, d := range raw.Dynamic {
		path, err := parsePattern(d.Path)
		if err != nil {
			return nil, fmt.Errorf("route table: dynamic route %d: %w", i, err)
		}
		t.dynamic = append(t.dynamic, dynamicRoute{path: path, route: d.Go})
	}
	return t, nil
}

// parsePattern reads a pattern written as a segment list, as in the router
// contract spec (section 9.1): "docs" is a literal segment, {"param": "id"}
// one segment, {"rest": "path", "min": 1} the remaining segments.
func parsePattern(items []json.RawMessage) ([]entry, error) {
	path := make([]entry, 0, len(items))
	for i, item := range items {
		var text string
		if err := json.Unmarshal(item, &text); err == nil {
			if text == "" {
				return nil, fmt.Errorf("empty literal segment")
			}
			path = append(path, entry{kind: literal, text: text})
			continue
		}
		var obj struct {
			Param *string `json:"param"`
			Rest  *string `json:"rest"`
			Min   *int    `json:"min"`
		}
		// Unknown fields (a "suffix", an "is" constraint from a later version
		// of the format) are an error: matching without them would accept
		// paths Node doesn't.
		decoder := json.NewDecoder(bytes.NewReader(item))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&obj); err != nil {
			return nil, fmt.Errorf("segment %d: %w", i, err)
		}
		switch {
		case obj.Param != nil && obj.Rest == nil && obj.Min == nil:
			path = append(path, entry{kind: param})
		case obj.Rest != nil && obj.Param == nil && obj.Min != nil && (*obj.Min == 0 || *obj.Min == 1):
			if i != len(items)-1 {
				return nil, fmt.Errorf("segment %d: rest must be last", i)
			}
			kind := rest
			if *obj.Min == 0 {
				kind = optionalRest
			}
			path = append(path, entry{kind: kind})
		default:
			return nil, fmt.Errorf("segment %d: unsupported entry %s", i, item)
		}
	}
	return path, nil
}

// matches reports whether segments (non-empty, already checked by the
// request gate) fit the pattern.
func matches(pattern []entry, segments []string) bool {
	for i, e := range pattern {
		switch e.kind {
		case rest:
			return len(segments) > i
		case optionalRest:
			return true
		}
		if i >= len(segments) {
			return false
		}
		if e.kind == literal && segments[i] != e.text {
			return false
		}
	}
	return len(pattern) == len(segments)
}

// canonicalNames writes header names the way Go's HTTP server keys them
// ("x-custom-header" becomes "X-Custom-Header").
func canonicalNames(names []string) []string {
	out := make([]string, len(names))
	for i, name := range names {
		parts := strings.Split(strings.ToLower(name), "-")
		for j, part := range parts {
			if part != "" {
				parts[j] = strings.ToUpper(part[:1]) + part[1:]
			}
		}
		out[i] = strings.Join(parts, "-")
	}
	return out
}
