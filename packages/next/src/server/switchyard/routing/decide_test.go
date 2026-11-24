package routing

import (
	"testing"
)

func TestLoadRejectsUnknownVersionsAndPatterns(t *testing.T) {
	for _, table := range []string{
		`{"contract":{"version":2},"maxHeaderBytes":1}`,
		`{"contract":{"version":1},"maxHeaderBytes":1,"goExact":{"/api/echo":""}}`,
	} {
		if _, err := Load([]byte(table)); err == nil {
			t.Errorf("Load(%s) succeeded", table)
		}
	}
}

func TestLoadReadsAnAppWithoutDirectRoutes(t *testing.T) {
	table, err := Load([]byte(`{"contract":{"version":1},"reason":"proxy"}`))
	if err != nil {
		t.Fatal(err)
	}
	if table.reason != "proxy" {
		t.Errorf("reason %q, want proxy", table.reason)
	}
}
