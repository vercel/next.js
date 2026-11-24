package main

import (
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// With next.config `compress` on, Node runs every response through the
// `compression` middleware (version 1.7.4, router-server.ts). This file makes
// the same choices for a direct response, in the middleware's order: the
// Content-Type and Cache-Control decide whether it adds Vary and may compress
// at all; then a Content-Length below 1 KiB, a Content-Encoding, HEAD, or an
// Accept-Encoding without gzip or deflate leave the body as it is. The
// middleware never flushes zlib between chunks, so neither does Switchyard.
//
// Go's flate produces different bytes from zlib's for the same input (and
// the gzip header names no operating system), so a direct response's
// compressed body differs from Node's but decompresses to the same bytes.

// compressionThreshold is the middleware's default, which Next.js keeps.
const compressionThreshold = 1024

var noTransform = regexp.MustCompile(`(?:^|,)\s*no-transform\s*(?:,|$)`)

// compressible reports whether the middleware would consider the response:
// a compressible Content-Type and no Cache-Control: no-transform. It then
// adds Vary: Accept-Encoding, whether it compresses or not.
func compressible(header http.Header, s *directState) bool {
	if noTransform.MatchString(strings.Join(header.Values("Cache-Control"), ", ")) {
		return false
	}
	// Node gets an array for a repeated Content-Type, which the middleware
	// treats as not compressible.
	types := header["Content-Type"]
	if len(types) != 1 {
		return false
	}
	typ := strings.ToLower(strings.TrimSpace(types[0]))
	if end := strings.IndexAny(typ, "; \t\r\n"); end >= 0 {
		typ = typ[:end]
	}
	// The MIME overrides come from the database bundled with the middleware.
	ok, known := s.mimeTypes[typ]
	if !known {
		ok = strings.HasPrefix(typ, "text/") || strings.HasSuffix(typ, "+json") || strings.HasSuffix(typ, "+text") || strings.HasSuffix(typ, "+xml")
	}
	return ok
}

// addCompressionVary adds Accept-Encoding to Vary as the middleware's `vary`
// does. It writes the field back as one line, which becomes just "*" when
// any field is "*", and adds Accept-Encoding when it isn't there yet.
func addCompressionVary(header http.Header) {
	vary := strings.Join(header.Values("Vary"), ", ")
	fields := strings.Split(vary, ",")
	for _, field := range fields {
		if strings.TrimSpace(field) == "*" {
			header.Set("Vary", "*")
			return
		}
	}
	for _, field := range fields {
		if strings.EqualFold(strings.TrimSpace(field), "Accept-Encoding") {
			header.Set("Vary", vary)
			return
		}
	}
	if vary != "" {
		vary += ", "
	}
	header.Set("Vary", vary+"Accept-Encoding")
}

// compressMode is what directAttempt does with a response's body.
type compressMode uint8

const (
	// Pass the body on as it is.
	compressNone compressMode = iota
	// Compress the body.
	compressBody
	// The worker sent no Content-Length: hold the headers until the body
	// starts, as the middleware does. A body that starts is compressed when
	// encoding is set; one that ends empty never is, and goes out chunked.
	compressIfBody
)

// planCompression reads the worker's response and returns what the
// middleware would do with its body, and the encoding to use. It also adds
// the middleware's Vary.
func planCompression(res *http.Response, s *directState) (compressMode, string) {
	if !s.compress {
		return compressNone, ""
	}
	encoding := ""
	if compressible(res.Header, s) {
		addCompressionVary(res.Header)
		// One line is enough: a request with repeated Accept-Encoding lines
		// goes to Node (routing.Decide), where the middleware joins them.
		encoding = negotiateEncoding(res.Request.Header.Get("Accept-Encoding"))
	}
	if res.Request.Method == "HEAD" {
		return compressNone, ""
	}
	if ce := res.Header["Content-Encoding"]; len(ce) > 1 || len(ce) == 1 && ce[0] != "" && ce[0] != "identity" {
		encoding = ""
	}
	cl, ok := res.Header["Content-Length"]
	if !ok {
		// Even without compression, the middleware sends the headers
		// itself when the body ends, so an empty body goes out chunked.
		return compressIfBody, encoding
	}
	if encoding == "" || belowThreshold(cl) {
		return compressNone, ""
	}
	return compressBody, encoding
}

// belowThreshold reads Content-Length as the middleware does, with
// JavaScript's Number: an empty value is 0, a value that isn't a number is
// never below the threshold.
func belowThreshold(values []string) bool {
	if len(values) != 1 {
		return false
	}
	v := strings.Trim(values[0], " \t")
	if v == "" {
		return true
	}
	n, err := strconv.ParseUint(v, 10, 64)
	return err == nil && n < compressionThreshold
}

// encoder compresses one response body. Its output collects in out until
// directAttempt sends it on.
type encoder struct {
	w interface {
		io.WriteCloser
		Reset(io.Writer)
	}
	out bytes.Buffer
}

// Compressors allocate their window and tables up front (about 800 KB
// each), so they are reused across responses.
var encoders = map[string]*sync.Pool{
	"gzip": {New: func() any {
		e := &encoder{}
		e.w = gzip.NewWriter(&e.out)
		return e
	}},
	"deflate": {New: func() any {
		e := &encoder{}
		e.w = zlib.NewWriter(&e.out)
		return e
	}},
}

func getEncoder(encoding string) *encoder {
	e := encoders[encoding].Get().(*encoder)
	e.out.Reset()
	e.w.Reset(&e.out)
	return e
}

// negotiateEncoding picks gzip, deflate or nothing from Accept-Encoding as
// the middleware does, through `accepts` 1.3.7 and `negotiator` 0.6.2, for
// the values the routing gate lets through: codings without parameters, so
// each has q=1. Each of gzip, deflate and identity takes the entry that
// names it or, failing that, "*" (the last one if repeated); identity, when
// neither it nor "*" is listed, counts as named after every entry. They then
// rank named before "*", then by entry, then in that order. The middleware
// takes gzip over deflate whenever gzip is acceptable at all.
func negotiateEncoding(accept string) string {
	forGzip, forDeflate, forIdentity := noMatch, noMatch, noMatch
	entries := strings.Split(accept, ",")
	listsIdentity := false
	for i, entry := range entries {
		coding := strings.Trim(entry, " \t")
		if coding == "" {
			continue
		}
		listsIdentity = listsIdentity || coding == "*" || strings.EqualFold(coding, "identity")
		forGzip = forGzip.with(coding, "gzip", i)
		forDeflate = forDeflate.with(coding, "deflate", i)
		forIdentity = forIdentity.with(coding, "identity", i)
	}
	if !listsIdentity {
		forIdentity = codingMatch{named: true, entry: len(entries)}
	}
	method := best(offer{"gzip", forGzip}, offer{"deflate", forDeflate}, offer{"identity", forIdentity})
	if method == "deflate" && forGzip != noMatch {
		method = best(offer{"gzip", forGzip}, offer{"identity", forIdentity})
	}
	if method == "identity" {
		return ""
	}
	return method
}

// codingMatch is the Accept-Encoding entry that accepts a coding.
type codingMatch struct {
	named bool // the entry names the coding, rather than "*"
	entry int  // the entry's position, -1 for none
}

var noMatch = codingMatch{entry: -1}

// with returns the entry negotiator keeps for name after seeing coding at
// position i: one that names it over "*", else the later one.
func (m codingMatch) with(coding, name string, i int) codingMatch {
	named := strings.EqualFold(coding, name)
	if !named && coding != "*" || m.entry >= 0 && m.named && !named {
		return m
	}
	return codingMatch{named: named, entry: i}
}

type offer struct {
	coding string
	match  codingMatch
}

// best returns the offered coding that negotiator ranks first, or "".
func best(offers ...offer) string {
	var pick *offer
	for i := range offers {
		o := &offers[i]
		if o.match.entry < 0 {
			continue
		}
		if pick == nil || o.match.named && !pick.match.named || o.match.named == pick.match.named && o.match.entry < pick.match.entry {
			pick = o
		}
	}
	if pick == nil {
		return ""
	}
	return pick.coding
}
