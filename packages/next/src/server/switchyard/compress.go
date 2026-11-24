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
//   - gzhttp sends an empty body of unknown length with Content-Length: 0;
//     the middleware sends it chunked.
//   - gzhttp compresses whenever the client names gzip; the middleware
//     sends identity when the client prefers it ("gzip;q=0.5, identity"),
//     and reads "*" as gzip, which this gzhttp version doesn't (its
//     AcceptWildcards option needs v1.20, which needs Go 1.25).
//   - gzhttp leaves any Content-Encoding alone; the middleware treats
//     "identity" as none and compresses.
//   - gzhttp sends each compressed chunk as the worker flushes it; the
//     middleware holds it in zlib until more output is ready.
//
// What stays as in the middleware: no compression for HEAD, for a response
// that already has a Content-Encoding (other than identity, above), for
// Cache-Control: no-transform, or for a body of a known length under 1 KiB.
// The compressed bytes differ in any case; the decompressed body is the
// same.
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
// XML and JavaScript, the structured-syntax suffixes for them, and the other
// types a web app serves that the database marks compressible (fonts, icons,
// WebAssembly, forms). Of the database's 607 compressible types it leaves out
// 21, such as application/x-sh, tar archives and VirtualBox disk images.
func compressibleType(contentType string) bool {
	typ, _, _ := strings.Cut(contentType, ";")
	typ = strings.ToLower(strings.TrimSpace(typ))
	switch typ {
	case "application/json", "application/javascript", "application/ecmascript",
		"application/x-javascript", "application/xml", "application/xml-dtd",
		"application/manifest+json", "application/toml", "application/wasm",
		"application/rtf", "application/x-www-form-urlencoded",
		"font/ttf", "font/otf", "application/vnd.ms-fontobject",
		"application/vnd.ms-opentype", "image/svg+xml", "image/bmp",
		"image/x-ms-bmp", "image/x-icon", "image/vnd.microsoft.icon":
		return true
	}
	return strings.HasPrefix(typ, "text/") || strings.HasSuffix(typ, "+json") ||
		strings.HasSuffix(typ, "+xml") || strings.HasSuffix(typ, "+text")
}

var noTransform = regexp.MustCompile(`(?:^|,)\s*no-transform\s*(?:,|$)`)

// keepNodesCompression readies the response headers for an answer Node
// writes through the compressor, when a direct request is handed back to
// Node: Node already compressed it or chose not to, and adds its own Vary, so
// the compressor's Vary goes and the compressor leaves the body alone.
func keepNodesCompression(header http.Header) {
	header.Del("Vary")
	header.Set(gzhttp.HeaderNoCompression, "1")
}

// skipCompression marks a worker's response that the middleware wouldn't
// compress but gzhttp would: a HEAD response, or one that says
// Cache-Control: no-transform. gzhttp removes the marker before the
// response goes out.
func skipCompression(res *http.Response) {
	if res.Request.Method == http.MethodHead || noTransform.MatchString(strings.Join(res.Header["Cache-Control"], ",")) {
		res.Header.Set(gzhttp.HeaderNoCompression, "1")
	}
}
