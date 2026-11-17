package routing

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

type caseFile struct {
	Tables map[string]json.RawMessage `json:"tables"`
	Cases  []struct {
		Table         string              `json:"table"`
		Method        string              `json:"method"`
		Target        string              `json:"target"`
		Proto         string              `json:"proto"`
		Header        map[string][]string `json:"header"`
		ContentLength int64               `json:"contentLength"`
		Route         string              `json:"route"`
		Node          string              `json:"node"`
	} `json:"cases"`
}

// TestDecideCases runs testdata/decide.json, the cases other hosts can share.
func TestDecideCases(t *testing.T) {
	data, err := os.ReadFile("testdata/decide.json")
	if err != nil {
		t.Fatal(err)
	}
	var file caseFile
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatal(err)
	}
	tables := map[string]*Table{}
	for name, raw := range file.Tables {
		table, err := Load(raw)
		if err != nil {
			t.Fatalf("table %s: %v", name, err)
		}
		tables[name] = table
	}
	for _, c := range file.Cases {
		if (c.Route == "") == (c.Node == "") {
			t.Fatalf("case %s %s: set exactly one of route and node", c.Table, c.Target)
		}
		r := Request{Method: c.Method, Target: c.Target, Proto: c.Proto, Header: c.Header, ContentLength: c.ContentLength}
		if r.Method == "" {
			r.Method = "GET"
		}
		if r.Proto == "" {
			r.Proto = "HTTP/1.1"
		}
		// "@N" stands for a value N bytes long.
		for name, values := range r.Header {
			for i, v := range values {
				if n, ok := strings.CutPrefix(v, "@"); ok {
					var size int
					json.Unmarshal([]byte(n), &size)
					values[i] = strings.Repeat("x", size)
				}
			}
			r.Header[name] = values
		}
		got := tables[c.Table].Decide(r)
		want := Decision{Route: c.Route, Why: c.Node}
		if got != want {
			t.Errorf("%s %s %s: got %+v, want %+v", c.Table, r.Method, c.Target, got, want)
		}
	}
}

func TestLoadRejectsUnknownVersionsAndPatterns(t *testing.T) {
	for _, table := range []string{
		`{"contract":{"version":2},"maxHeaderBytes":1}`,
		`{"contract":{"version":1}}`,
		`{"contract":{"version":1},"maxHeaderBytes":1,"basePath":"shop"}`,
		`{"contract":{"version":1},"maxHeaderBytes":1,"dynamic":[{"path":[{"rest":"a","min":1},"x"]}]}`,
		`{"contract":{"version":1},"maxHeaderBytes":1,"dynamic":[{"path":[{"param":"id","suffix":".json"}]}]}`,
		`{"contract":{"version":1},"maxHeaderBytes":1,"dynamic":[{"path":[""]}]}`,
	} {
		if _, err := Load([]byte(table)); err == nil {
			t.Errorf("Load(%s) succeeded", table)
		}
	}
}
