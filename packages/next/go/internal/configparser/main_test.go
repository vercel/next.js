package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestStaticConfig(t *testing.T) {
	source := `package main
import framework "github.com/vercel/next.js/packages/next/go"
var Config = framework.ProxyConfig{
 MaxDuration: 30,
 PreferredRegion: []string{"iad1", "sfo1"},
 Matcher: []framework.Matcher{{Source: "/account/:path*", Locale: false,
  Has: []framework.RouteHas{{Type: "header", Key: "x-account", Value: "yes"}},
  Missing: []framework.RouteHas{{Type: "cookie", Key: "skip"}},
 }},
}
func init() { panic("the config reader must never execute application code") }
`
	config, err := extract(input{"proxy.go", source, "proxy"})
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(config)
	want := `{"matcher":[{"has":[{"key":"x-account","type":"header","value":"yes"}],"locale":false,"missing":[{"key":"skip","type":"cookie"}],"source":"/account/:path*"}],"maxDuration":30,"preferredRegion":["iad1","sfo1"]}`
	if string(encoded) != want {
		t.Fatalf("got %s, want %s", encoded, want)
	}
}

func TestConfigDefaults(t *testing.T) {
	for _, source := range []string{
		"package main\nfunc GET() {}",
		`package main; import next "github.com/vercel/next.js/packages/next/go"; var Config = next.RouteConfig{}`,
	} {
		config, err := extract(input{"route.go", source, "route"})
		if err != nil || len(config) != 0 {
			t.Fatalf("defaults: %v %v", config, err)
		}
	}
}

func TestRejectsDynamicAndInvalidConfig(t *testing.T) {
	cases := []struct{ name, declaration, kind string }{
		{"factory", "var Config = makeConfig()", "route"},
		{"function", "func Config() next.RouteConfig { return next.RouteConfig{} }", "route"},
		{"uninitialized", "var Config next.RouteConfig", "route"},
		{"map", "var Config = map[string]any{}", "route"},
		{"wrong-kind", "var Config = next.ProxyConfig{}", "route"},
		{"unknown-field", "var Config = next.RouteConfig{Runtime: \"edge\"}", "route"},
		{"duplicate-field", "var Config = next.RouteConfig{MaxDuration: 2, MaxDuration: 3}", "route"},
		{"duplicate-config", "var Config = next.RouteConfig{}; var Config = next.RouteConfig{}", "route"},
		{"positional", "var Config = next.RouteConfig{30}", "route"},
		{"call", "var Config = next.RouteConfig{MaxDuration: duration()}", "route"},
		{"reference", "const duration = 30; var Config = next.RouteConfig{MaxDuration: duration}", "route"},
		{"arithmetic", "var Config = next.RouteConfig{MaxDuration: 10 + 20}", "route"},
		{"negative", "var Config = next.RouteConfig{MaxDuration: -1}", "route"},
		{"zero", "var Config = next.RouteConfig{MaxDuration: 0}", "route"},
		{"fraction", "var Config = next.RouteConfig{MaxDuration: 1.5}", "route"},
		{"overflow", "var Config = next.RouteConfig{MaxDuration: 99999999999999}", "route"},
		{"environment", "var Config = next.RouteConfig{PreferredRegion: []string{os.Getenv(\"REGION\")}}", "route"},
		{"concat", "var Config = next.RouteConfig{PreferredRegion: []string{\"iad\" + \"1\"}}", "route"},
		{"slice-reference", "var Config = next.RouteConfig{PreferredRegion: regions}", "route"},
		{"indexed-slice", "var Config = next.RouteConfig{PreferredRegion: []string{0: \"iad1\"}}", "route"},
		{"empty-region", "var Config = next.RouteConfig{PreferredRegion: []string{\"\"}}", "route"},
		{"wrong-slice", "var Config = next.RouteConfig{PreferredRegion: []int{1}}", "route"},
		{"matcher-reference", "var Config = next.ProxyConfig{Matcher: matchers}", "proxy"},
		{"matcher-call", "var Config = next.ProxyConfig{Matcher: []next.Matcher{{Source: source()}}}", "proxy"},
		{"condition-call", "var Config = next.ProxyConfig{Matcher: []next.Matcher{{Source: \"/\", Has: []next.RouteHas{{Type: \"header\", Key: key()}}}}}", "proxy"},
		{"locale-reference", "var Config = next.ProxyConfig{Matcher: []next.Matcher{{Source: \"/\", Locale: disabled}}}", "proxy"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			source := "package main\nimport next \"github.com/vercel/next.js/packages/next/go\"\n" + tc.declaration
			_, err := extract(input{tc.kind + ".go", source, tc.kind})
			if err == nil || !strings.Contains(err.Error(), tc.kind+".go:") {
				t.Fatalf("expected a located config error, got %v", err)
			}
		})
	}
}

func TestRejectsImpersonatedSDKType(t *testing.T) {
	_, err := extract(input{"route.go", `package main; import next "example.com/other"; var Config = next.RouteConfig{MaxDuration: 30}`, "route"})
	if err == nil {
		t.Fatal("accepted a config type from a different package")
	}
}
