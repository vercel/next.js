package main

import (
	"fmt"
	"net/http"

	"next/go/assets"
)

var entry = assets.Browser("app/browser/optional.ts")

func GET(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprint(w, "<!doctype html><html><head>")
	if err := assets.RenderTags(w, entry); err != nil {
		panic(err)
	}
	fmt.Fprint(w, "</head><body>default import</body></html>")
}
