package main

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

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
	f := newSwitchyard(http.NotFoundHandler())
	f.apply(controlMessage{Event: "table", Table: json.RawMessage(`{"contract":{"version":1},"goExact":{"/api/echo":"/api/echo/route"}}`)})
	f.apply(controlMessage{Event: "worker", Page: "/api/echo/route",
		Address: "127.0.0.1:51300", TokenHeader: "x-next-internal-go-token", Token: "secret",
		Route: "/api/echo"})
	s := f.state.Load()
	if s.table == nil {
		t.Fatal("no table")
	}
	up := s.workers["/api/echo/route"]
	if up == nil || up.address != "127.0.0.1:51300" || up.tokenHeader != "X-Next-Internal-Go-Token" ||
		len(up.route) != 1 || up.route[0] != "/api/echo" {
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

func TestApplyIgnoresIncompleteWorkerMessages(t *testing.T) {
	f := newSwitchyard(http.NotFoundHandler())
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
	f := newSwitchyard(http.NotFoundHandler())
	f.state.Store(&directState{workers: map[string]*goUpstream{
		"/api/echo/route": {address: "127.0.0.1:51300"},
	}})
	f.apply(controlMessage{Event: "gone", Address: "127.0.0.1:51300", Token: "secret"})
	if f.state.Load().workers["/api/echo/route"] == nil {
		t.Error("a gone removed a worker with no token")
	}
}

func TestWorkerHeadersReplaceEveryClientRoutingValue(t *testing.T) {
	for _, route := range []string{"/api/[id]", "/catch/[...slug]", "/", "/café a 100%", "/日本語"} {
		up := &goUpstream{tokenHeader: "X-Next-Internal-Go-Token", token: []string{"secret"}, route: routeValue(route)}
		// What a client can send: repeated values, other letter cases (kept as
		// given by code that writes the map directly) and forged private
		// metadata.
		h := http.Header{
			"X-Matched-Path":           {"/admin", "/other"},
			"x-matched-path":           {"/admin"},
			"X-MATCHED-PATH":           {"/admin"},
			"X-Next-Internal-Go-Token": {"forged"},
			"X-Next-Internal-Go-Route": {"%2Fadmin"},
			"x-next-internal-anything": {"forged"},
			"X-Matched-Path-Other":     {"kept"},
			"Accept":                   {"text/plain"},
		}
		up.setWorkerHeaders(h)
		want := http.Header{
			"X-Matched-Path":           {route},
			"X-Next-Internal-Go-Token": {"secret"},
			"X-Matched-Path-Other":     {"kept"},
			"Accept":                   {"text/plain"},
		}
		if !reflect.DeepEqual(h, want) {
			t.Errorf("%s: headers %v, want %v", route, h, want)
		}
	}
	// A development worker serves one route and gets no x-matched-path.
	up := &goUpstream{tokenHeader: "X-Next-Internal-Go-Token", token: []string{"secret"}, route: routeValue("")}
	h := http.Header{"X-Matched-Path": {"/admin"}}
	up.setWorkerHeaders(h)
	if _, ok := h["X-Matched-Path"]; ok || len(h) != 1 {
		t.Errorf("development worker headers %v", h)
	}
}
