# Go browser assets

Public import: `next/go/assets`. The SDK's canonical module is
`github.com/vercel/next.js/packages/next-go`.

Use an ordinary Go module mapping in the application's `go.mod`:

```go
require next/go v0.0.0

replace next/go => github.com/vercel/next.js/packages/next-go <SDK_VERSION>
```

Replace `<SDK_VERSION>` with a pinned SDK release or Go pseudo-version, then run
`go mod download next/go` to populate the module cache and `go.sum`. The SDK must
be available at that version; this source checkout does not publish a release.
The mapping uses Go's module resolver and works with editors and Go tooling. No
vanity URL, import rewriting or custom package resolver is involved.

Route builds use the local Go module cache without downloading modules or changing
`go.mod` or `go.sum`. Versioned module replacements are supported; local-directory
replacements remain unsupported.

## Declare and render an entrypoint

```go
// app/dashboard/route.go
package main

import (
  "fmt"
  "net/http"

  "next/go/assets"
)

var dashboard = assets.Browser("app/dashboard/client.ts")

func GET(w http.ResponseWriter, r *http.Request) {
  w.Header().Set("Content-Type", "text/html")
  fmt.Fprint(w, "<!doctype html><html><head>")
  if err := assets.RenderTags(w, dashboard); err != nil {
    panic(err)
  }
  fmt.Fprint(w, "</head><body><main id=\"dashboard\"></main></body></html>")
}
```

```ts
// app/dashboard/client.ts
import './styles.css'

document.querySelector('#dashboard')!.textContent = 'Hello from the browser'
```

`Browser` constructs an ordinary Go handle without I/O. Declare it in a direct
package-level variable initializer in `route.go` with one string literal relative
to the Next application root. The package name is `assets`. Named import aliases also work. Turbopack discovers these
declarations without evaluating Go expressions or executing application code.
Sibling files and transitive Go packages are outside discovery; they can receive
and render handles declared in `route.go`.

Turbopack builds every declared entrypoint for production, including handles that
a handler renders conditionally. JS/TS imports include CSS and lazy chunks from
dynamic imports. Imported CSS needs no separate Go declaration.

Pass multiple handles together to deduplicate shared initial resources:

```go
err := assets.RenderTags(w, dashboard, navigation)
```

Stylesheets precede ordered deferred scripts. Dynamic imports remain lazy. The
browser chunk group's runtime and bootstrap are included automatically.

## Use html/template

Register a function for each request:

```go
functions := template.FuncMap{
  "assetTags": func() (template.HTML, error) {
    return assets.Tags(w, dashboard, navigation)
  },
}
```

Use `{{ assetTags }}` in the template. `Tags` resolves all requested handles before
returning trusted HTML and an error. URLs are HTML-escaped. `RenderTags` similarly
resolves all handles before writing, and propagates output errors.

Both helpers need the route response writer. Response-writer middleware can
preserve the manifest binding through `Unwrap() http.ResponseWriter`. Template
output may go to another writer; capture the original response writer in the
registered function.

## Asset generations

The generated adapter supplies an immutable manifest snapshot to each request.
JS/CSS dependency edits reload the document in development without recompiling or
restarting its Go worker. Browser assets are served by Next's asset pipeline;
bundle bytes are not embedded in Go executables. Native deployment adapter outputs
carry the manifest beside the executable.

Go continues to own package resolution, compilation and linking. The SDK does not
execute JavaScript on the server or create Go-to-JavaScript function bindings.

Run SDK checks with `go test ./...` from this directory.
