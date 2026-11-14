package assets_test

import (
	"html/template"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/vercel/next.js/packages/next-go/assets"
)

func TestRenderAndTemplate(t *testing.T) {
	dashboard, navigation := assets.Browser("dashboard.ts"), assets.Browser("navigation.ts")
	manifest := assets.Manifest{
		"dashboard.ts":  {{Kind: "stylesheet", URL: "/style.css?x=1&y=2"}, {Kind: "script", URL: "/shared.js"}, {Kind: "script", URL: "/dashboard.js"}},
		"navigation.ts": {{Kind: "script", URL: "/shared.js"}, {Kind: "script", URL: "/navigation.js"}},
	}
	response := httptest.NewRecorder()
	w := assets.WithManifest(response, manifest)
	if err := assets.RenderTags(w, dashboard, navigation, dashboard); err != nil {
		t.Fatal(err)
	}
	expected := `<link rel="stylesheet" href="/style.css?x=1&amp;y=2"><script src="/shared.js" defer></script><script src="/dashboard.js" defer></script><script src="/navigation.js" defer></script>`
	if response.Body.String() != expected {
		t.Fatalf("tags: %s", response.Body.String())
	}
	response.Body.Reset()
	tmpl := template.Must(template.New("page").Funcs(template.FuncMap{
		"assetTags": func() (template.HTML, error) { return assets.Tags(w, dashboard, navigation) },
	}).Parse(`<head>{{assetTags}}</head>`))
	if err := tmpl.Execute(w, nil); err != nil {
		t.Fatal(err)
	}
	if response.Body.String() != "<head>"+expected+"</head>" {
		t.Fatal(response.Body.String())
	}
}

func TestMissingHandleWritesNothing(t *testing.T) {
	response := httptest.NewRecorder()
	w := assets.WithManifest(response, assets.Manifest{"valid.ts": {{Kind: "script", URL: "/valid.js"}}})
	err := assets.RenderTags(w, assets.Browser("valid.ts"), assets.Browser("missing.ts"))
	if err == nil || !strings.Contains(err.Error(), "missing.ts") {
		t.Fatal(err)
	}
	if response.Body.Len() != 0 {
		t.Fatal("partial tags escaped before resolution completed")
	}
	if err := assets.RenderTags(response, assets.Browser("valid.ts")); err == nil {
		t.Fatal("missing binding accepted")
	}
}
