package main

// Selection shared by every production executable. Next.js generates this file
// beside the entrypoint; it is not part of the route API.

import (
	"net/http"
	"strings"
	"unicode/utf8"
)

// nextGoMatchedPathHandler selects the route named by x-matched-path. Whatever
// forwards requests to the executable must set the header from its routing
// decision and drop every value the client sent: the platform's proxy for
// adapter builds, as Vercel's does and as the Next.js server assumes in minimal
// mode, and Next.js itself, or Switchyard, under next start.
func nextGoMatchedPathHandler(routes map[string]http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		values := r.Header.Values("X-Matched-Path")
		if len(values) != 1 {
			http.NotFound(w, r)
			return
		}
		id, ok := nextGoMatchedPathID(values[0])
		if !ok {
			http.NotFound(w, r)
			return
		}
		handler, ok := routes[id]
		if !ok {
			http.NotFound(w, r)
			return
		}
		handler(w, r)
	}
}

// nextGoMatchedPathID maps an x-matched-path value to an output ID with the
// steps the Next.js server applies before it looks up the matched route
// (packages/next/src/server/base-server.ts, the x-matched-path branch of
// handleRequestImpl). Steps that cannot address an App Router route handler
// are left out. The build rejects Go outputs whose IDs these steps would map to
// another value, so every output ID maps to itself and a value names at most
// one output (go_matched_path_issues in next-api's app.rs).
//
//   - fixMojibake: the header carries the pathname's UTF-8 bytes, not
//     percent-encoding, and Go reads header bytes as is. Node replaces invalid
//     UTF-8 with U+FFFD, which would map many values to one, so such a value
//     selects nothing instead.
//   - denormalizePagePath: backslashes become slashes, /index becomes /, and a
//     static /index/... loses its /index prefix.
//
// basePath is not stripped: platforms set x-matched-path without it.
func nextGoMatchedPathID(value string) (string, bool) {
	if !utf8.ValidString(value) {
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
