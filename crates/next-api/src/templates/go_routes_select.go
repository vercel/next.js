package main

// Selection for adapter executables. Next.js generates this file beside the
// adapter entrypoint; it is not part of the route API.

import (
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

// nextGoMatchedPathHandler selects the output named by x-matched-path. The
// platform's proxy must set the header from its routing decision and drop every
// value the client sent, as Vercel's does and as the Next.js server assumes in
// minimal mode.
func nextGoMatchedPathHandler(routes map[string]http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		values := r.Header.Values("X-Matched-Path")
		if len(values) != 1 {
			http.NotFound(w, r)
			return
		}
		handler, ok := nextGoSelectMatchedPath(routes, values[0])
		if !ok {
			http.NotFound(w, r)
			return
		}
		handler(w, r)
	}
}

// nextGoSelectMatchedPath returns the output an x-matched-path value names.
// The Next.js server parses the header as a URL path, so both /café and
// /caf%C3%A9 name the same route there. Here a value names an output as sent
// (the platform's raw UTF-8 bytes) or, if it contains %, decoded once. A value
// whose two readings name different outputs is ambiguous and names neither,
// and the build rejects IDs that would make their own value ambiguous
// (go_matched_path_issue in next-api's app.rs), so no value selects two
// outputs and every output stays selectable by its own ID.
func nextGoSelectMatchedPath(routes map[string]http.HandlerFunc, value string) (http.HandlerFunc, bool) {
	raw, ok := nextGoMatchedPathID(value)
	if !ok {
		return nil, false
	}
	rawHandler, rawOK := routes[raw]
	if !strings.Contains(value, "%") {
		return rawHandler, rawOK
	}
	unescaped, ok := nextGoUnescapeMatchedPath(value)
	if !ok {
		return rawHandler, rawOK
	}
	decoded, ok := nextGoMatchedPathID(unescaped)
	if !ok {
		return rawHandler, rawOK
	}
	decodedHandler, decodedOK := routes[decoded]
	switch {
	case rawOK && decodedOK && raw != decoded:
		return nil, false
	case rawOK:
		return rawHandler, true
	default:
		return decodedHandler, decodedOK
	}
}

// nextGoUnescapeMatchedPath decodes %XX escapes once. An invalid escape gives
// no decoded reading, and so does an escaped / or \, which would move segment
// boundaries.
func nextGoUnescapeMatchedPath(value string) (string, bool) {
	lower := strings.ToLower(value)
	if strings.Contains(lower, "%2f") || strings.Contains(lower, "%5c") {
		return "", false
	}
	unescaped, err := url.PathUnescape(value)
	if err != nil {
		return "", false
	}
	return unescaped, true
}

// nextGoMatchedPathID maps an x-matched-path value to an output ID with the
// steps the Next.js server applies before it looks up the matched route
// (packages/next/src/server/base-server.ts, the x-matched-path branch of
// handleRequestImpl). Steps that cannot address an App Router route handler
// are left out. The build rejects Go outputs whose IDs these steps would map to
// another value, so every output ID maps to itself and a value names at most
// one output (go_matched_path_issue in next-api's app.rs).
//
//   - fixMojibake: the header carries the pathname's UTF-8 bytes, and Go reads
//     header bytes as is. Node replaces invalid UTF-8 with U+FFFD, which would
//     map many values to one, so such a value selects nothing instead.
//   - new URL(value).pathname: Node ends the path at ? or #. Such a value
//     selects nothing here, and the build rejects IDs containing them. Node
//     also resolves . and .. segments, which no output ID contains.
//   - denormalizePagePath: backslashes become slashes, /index becomes /, and a
//     static /index/... loses its /index prefix.
//
// basePath is not stripped: platforms set x-matched-path without it.
func nextGoMatchedPathID(value string) (string, bool) {
	if !utf8.ValidString(value) || strings.ContainsAny(value, "?#") {
		return "", false
	}
	value = strings.ReplaceAll(value, `\`, "/")
	if value == "/index" {
		return "/", true
	}
	if strings.HasPrefix(value, "/index/") && !nextGoIsDynamicRoute(value) {
		return value[len("/index"):], true
	}
	return value, true
}

// nextGoIsDynamicRoute matches isDynamicRoute in strict mode: some segment is a
// whole [param], [...param] or [[...param]].
func nextGoIsDynamicRoute(route string) bool {
	for _, segment := range strings.Split(route, "/")[1:] {
		if len(segment) >= 3 && segment[0] == '[' && segment[len(segment)-1] == ']' {
			return true
		}
	}
	return false
}
