// Package assets renders browser entrypoints compiled by Turbopack.
package assets

import (
	"bufio"
	"fmt"
	"html"
	"html/template"
	"io"
	"net"
	"net/http"
	"strings"
)

// Entry identifies a project-root-relative browser source. Its output URLs are
// supplied by the framework for each request, independently of Go compilation.
type Entry struct{ path string }

// Browser declares a browser entrypoint. Declarations must be direct package-level
// variable initializers with a string literal in route.go. Browser does no I/O.
func Browser(path string) Entry { return Entry{path: path} }

// Resource is an initial resource in a framework-owned browser manifest.
type Resource struct {
	Kind string `json:"kind"`
	URL  string `json:"url"`
}

// Manifest maps declared source paths to their ordered initial resources.
// Dynamic imports are loaded by the browser runtime, not rendered as initial tags.
type Manifest map[string][]Resource

type responseWriter struct {
	http.ResponseWriter
	manifest Manifest
}

// WithManifest binds a framework-owned manifest snapshot to a response. This is
// used by the generated route adapter; applications normally receive this writer.
func WithManifest(w http.ResponseWriter, manifest Manifest) http.ResponseWriter {
	return &responseWriter{w, manifest}
}
func (w *responseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *responseWriter) Flush()                      { _ = http.NewResponseController(w.ResponseWriter).Flush() }
func (w *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return http.NewResponseController(w.ResponseWriter).Hijack()
}
func (w *responseWriter) Push(target string, options *http.PushOptions) error {
	if pusher, ok := w.ResponseWriter.(http.Pusher); ok {
		return pusher.Push(target, options)
	}
	return http.ErrNotSupported
}

func manifestFor(w io.Writer) (Manifest, error) {
	// Allow middleware to preserve the binding with the usual Unwrap convention.
	for {
		if bound, ok := w.(*responseWriter); ok {
			return bound.manifest, nil
		}
		if wrapped, ok := w.(interface{ Unwrap() http.ResponseWriter }); ok {
			w = wrapped.Unwrap()
			continue
		}
		return nil, fmt.Errorf("assets: response has no browser manifest; render using the route response writer")
	}
}

// Tags returns trusted HTML for html/template. Register a request-local closure,
//
//	e.g. template.FuncMap{"assetTags": func() (template.HTML, error) {
//	    return assets.Tags(w, dashboard)
//	}}. All handles are resolved before returning any HTML.
func Tags(w io.Writer, entries ...Entry) (template.HTML, error) {
	if len(entries) == 0 {
		return "", nil
	}
	manifest, err := manifestFor(w)
	if err != nil {
		return "", err
	}
	seen := map[Resource]bool{}
	var styles, preloads, scripts strings.Builder
	for _, entry := range entries {
		resources, ok := manifest[entry.path]
		if !ok {
			return "", fmt.Errorf("assets: browser entry %q is absent from this route's manifest; declare it in route.go", entry.path)
		}
		for _, resource := range resources {
			if seen[resource] {
				continue
			}
			seen[resource] = true
			url := html.EscapeString(resource.URL)
			switch resource.Kind {
			case "stylesheet":
				fmt.Fprintf(&styles, `<link rel="stylesheet" href="%s">`, url)
			case "preload":
				fmt.Fprintf(&preloads, `<link rel="preload" as="script" href="%s">`, url)
			case "modulepreload":
				fmt.Fprintf(&preloads, `<link rel="modulepreload" href="%s">`, url)
			case "module":
				fmt.Fprintf(&scripts, `<script type="module" src="%s"></script>`, url)
			case "script":
				fmt.Fprintf(&scripts, `<script src="%s" defer></script>`, url)
			default:
				return "", fmt.Errorf("assets: unknown resource kind %q", resource.Kind)
			}
		}
	}
	return template.HTML(styles.String() + preloads.String() + scripts.String()), nil
}

// RenderTags writes the deduplicated initial styles, preloads and scripts of all
// supplied entrypoints. Pass shared handles together to deduplicate their resources.
func RenderTags(w io.Writer, entries ...Entry) error {
	tags, err := Tags(w, entries...)
	if err != nil {
		return err
	}
	_, err = io.WriteString(w, string(tags))
	return err
}
