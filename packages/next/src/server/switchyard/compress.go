package main

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/klauspost/compress/gzhttp"
)

// With next.config `compress` on, Node runs every response through the
// `compression` middleware (router-server.ts). For direct responses,
// Switchyard compresses with gzhttp (github.com/klauspost/compress) instead.
// It doesn't copy the middleware's choices one for one. Known differences:
//
//   - gzhttp adds Vary: Accept-Encoding to every response, as its own line,
//     where the middleware adds it only to compressible types and folds it
//     into the worker's Vary.
//   - gzhttp only sends gzip. A client that accepts deflate but not gzip
//     gets the body uncompressed; the middleware would deflate it.
//   - Which types count as compressible is decided by compressibleType below,
//     not by the middleware's MIME database.
//   - gzhttp waits for the first 1 KiB of a body of unknown length before it
//     decides; the middleware compresses such a body whatever its size.
//
// What stays as in the middleware: no compression for HEAD, for a response
// that already has a Content-Encoding, for Cache-Control: no-transform, or
// for a body of a known length under 1 KiB.
var compressDirect = func() func(http.Handler) http.HandlerFunc {
	wrap, err := gzhttp.NewWrapper(
		// The middleware's default threshold, which Next.js keeps.
		gzhttp.MinSize(1024),
		// gzhttp prefers zstd when the client accepts it, as current
		// browsers do; the middleware never sends it.
		gzhttp.EnableZstd(false),
		gzhttp.ContentTypeFilter(compressibleType),
	)
	if err != nil {
		panic(err)
	}
	return wrap
}()

// compressibleType approximates the middleware's MIME database: text, JSON,
// XML and JavaScript, and the structured-syntax suffixes for them.
func compressibleType(contentType string) bool {
	typ, _, _ := strings.Cut(contentType, ";")
	typ = strings.ToLower(strings.TrimSpace(typ))
	switch typ {
	case "application/json", "application/javascript", "application/xml",
		"application/x-javascript", "application/manifest+json", "image/svg+xml":
		return true
	}
	return strings.HasPrefix(typ, "text/") || strings.HasSuffix(typ, "+json") ||
		strings.HasSuffix(typ, "+xml") || strings.HasSuffix(typ, "+text")
}

var noTransform = regexp.MustCompile(`(?:^|,)\s*no-transform\s*(?:,|$)`)

// skipCompression marks a worker's response that the middleware wouldn't
// compress but gzhttp would: a HEAD response, or one that says
// Cache-Control: no-transform. gzhttp removes the marker before the
// response goes out.
func skipCompression(res *http.Response) {
	if res.Request.Method == http.MethodHead || noTransform.MatchString(strings.Join(res.Header["Cache-Control"], ",")) {
		res.Header.Set(gzhttp.HeaderNoCompression, "1")
	}
}
