package main

import (
	"fmt"
	"html/template"
	"net/http"
	"os"

	web "next/go/assets"
)

var dashboard = web.Browser("app/browser/client.ts")
var navigation = web.Browser("app/browser/navigation.ts")
var optional = web.Browser("app/browser/optional.ts")

func GET(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	w.Header().Set("X-Go-Pid", fmt.Sprint(os.Getpid()))
	if r.URL.Query().Has("optional") {
		if err := web.RenderTags(w, optional); err != nil {
			panic(err)
		}
		return
	}
	page := template.Must(template.New("page").Funcs(template.FuncMap{
		"assetTags": func() (template.HTML, error) { return web.Tags(w, dashboard, navigation, dashboard) },
	}).Parse(`<!doctype html><html><head>{{assetTags}}</head><body><p id="message">server</p><p id="navigation"></p><button id="lazy">load</button><p id="lazy-result"></p></body></html>`))
	if err := page.Execute(w, nil); err != nil {
		panic(err)
	}
}
