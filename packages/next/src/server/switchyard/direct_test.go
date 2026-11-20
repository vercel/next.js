package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

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
	f := newSwitchyard(http.NotFoundHandler())
	f.apply(controlMessage{Event: "table", Table: json.RawMessage(`{"contract":{"version":1},"goExact":{"/api/echo":"/api/echo/route"}}`)})
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
