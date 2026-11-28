package proxy_test

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"next/go/proxy"
)

func TestHelpers(t *testing.T) {
	for _, helper := range []struct {
		name string
		run  func(http.ResponseWriter, ...proxy.Option)
		key  string
		want string
	}{
		{"Next", proxy.Next, "x-middleware-next", "1"},
		{"Rewrite", func(w http.ResponseWriter, opts ...proxy.Option) {
			proxy.Rewrite(w, "/destination", opts...)
		}, "x-middleware-rewrite", "/destination"},
	} {
		t.Run(helper.name, func(t *testing.T) {
			for _, test := range []struct {
				name string
				opts []proxy.Option
				want string
			}{
				{"no options", nil, ""},
				{"nil headers", []proxy.Option{proxy.WithRequestHeaders(nil)}, ""},
				{"empty headers", []proxy.Option{proxy.WithRequestHeaders(http.Header{})}, "x-next-internal-go-empty-override"},
				{"replace headers", []proxy.Option{proxy.WithRequestHeaders(http.Header{"X-User": {"public"}})}, "x-user"},
				{"last option wins", []proxy.Option{
					proxy.WithRequestHeaders(http.Header{"X-Old": {"old"}}),
					proxy.WithRequestHeaders(http.Header{"X-User": {"public"}}),
				}, "x-user"},
				{"last nil preserves headers", []proxy.Option{
					proxy.WithRequestHeaders(http.Header{"X-Old": {"old"}}),
					proxy.WithRequestHeaders(nil),
				}, ""},
			} {
				t.Run(test.name, func(t *testing.T) {
					w := httptest.NewRecorder()
					helper.run(w, test.opts...)
					if got := w.Header().Get(helper.key); got != helper.want {
						t.Fatalf("%s = %q, want %q", helper.key, got, helper.want)
					}
					if got := w.Header().Get("x-middleware-override-headers"); got != test.want {
						t.Fatalf("override headers = %q, want %q", got, test.want)
					}
					if got := w.Header()["x-middleware-request-x-old"]; got != nil {
						t.Fatalf("earlier option leaked headers: %v", got)
					}
				})
			}
		})
	}
}

func TestWithRequestHeaders(t *testing.T) {
	headers := http.Header{
		"Connection":        {"X-Hop, Upgrade"},
		"X-Hop":             {"private"},
		"Upgrade":           {"websocket"},
		"Transfer-Encoding": {"chunked"},
		"X-User":            {"first"},
		"x-user":            {"second"},
		"Host":              {"example.com"},
	}
	original := headers.Clone()
	option := proxy.WithRequestHeaders(headers)
	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		proxy.Next(w, option)
		if got := w.Header().Get("x-middleware-override-headers"); got != "host,x-user" {
			t.Fatalf("override headers = %q", got)
		}
		if got := w.Header()["x-middleware-request-x-user"]; !reflect.DeepEqual(got, []string{"first", "second"}) {
			t.Fatalf("combined values = %v", got)
		}
		if got := w.Header()["x-middleware-request-host"]; !reflect.DeepEqual(got, []string{"example.com"}) {
			t.Fatalf("host = %v", got)
		}
		if !reflect.DeepEqual(headers, original) {
			t.Fatal("WithRequestHeaders mutated the caller's headers")
		}
	}
}
