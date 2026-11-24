package main

import (
	"net"
	"net/http"
	"net/textproto"
	"net/url"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"
	// __NEXT_GO_ROUTE_IMPORTS__
)

func main() {
	// The platform selects and authorizes an output before invoking the server.
	// Requests never select a handler by re-matching their pathname against the
	// compiled routes. The process binds to one output at startup, reads the
	// output from a routing header the adapter names, or, by default, reads it
	// from x-matched-path as the Next.js server does. See nextGoSelectHandler.
	routes := map[string]http.HandlerFunc{
		// __NEXT_GO_ROUTES__
	}
	// next build runs the executable once to surface failures in package
	// initialization, which has completed by now, as build errors.
	if os.Getenv("__NEXT_GO_STARTUP_CHECK") == "1" {
		return
	}
	handler := nextGoSelectHandler(routes)
	port := os.Getenv("PORT")
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		panic("route.go adapter server requires a valid PORT")
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("0.0.0.0", port))
	if err != nil {
		panic(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Adapter builds serve requests from the platform, not from Next.js, so
		// x-next-internal-* request headers can only come from the client.
		for name := range r.Header {
			if strings.HasPrefix(strings.ToLower(name), "x-next-internal-") {
				delete(r.Header, name)
			}
		}
		handler(w, r)
	})}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}

const nextGoRouteRequirement = "route.go adapter server requires __NEXT_GO_ROUTE to be the output.id of a Go output in this build"

// nextGoSelectHandler reads trusted process configuration from the adapter, in
// this order:
//
//   - __NEXT_GO_ROUTE binds the process to the output with exactly that ID.
//   - __NEXT_GO_ROUTE_HEADER names a request header that carries the selected
//     output ID percent-encoded (see nextGoLookupRoute).
//   - Otherwise each request selects its output from x-matched-path, which the
//     platform sets from its routing decision and clients cannot set, as the
//     Next.js server reads it in minimal mode (see nextGoMatchedPathID).
//
// A request that selects no output gets a 404. The pathname never selects one.
func nextGoSelectHandler(routes map[string]http.HandlerFunc) http.HandlerFunc {
	selected, hasSelected := os.LookupEnv("__NEXT_GO_ROUTE")
	header, hasHeader := os.LookupEnv("__NEXT_GO_ROUTE_HEADER")
	if hasSelected && hasHeader {
		panic("route.go adapter server accepts either __NEXT_GO_ROUTE or __NEXT_GO_ROUTE_HEADER, not both")
	}
	if hasHeader {
		return nextGoHeaderHandler(routes, header)
	}
	if hasSelected {
		handler, ok := routes[selected]
		if !ok {
			panic(nextGoRouteRequirement)
		}
		return handler
	}
	return nextGoMatchedPathHandler(routes)
}

// nextGoMatchedPathHandler selects the output named by x-matched-path. The
// platform must set the header from its routing decision and drop any value the
// client sent, as Vercel's proxy does and as the Next.js server assumes in
// minimal mode.
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
// one value, so a value names at most one output, and every output ID maps to
// itself (go_matched_path_collisions in next-api's app.rs).
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

func nextGoHeaderHandler(routes map[string]http.HandlerFunc, header string) http.HandlerFunc {
	if !nextGoValidHeaderName(header) {
		panic("route.go adapter server requires __NEXT_GO_ROUTE_HEADER to be a valid HTTP header name")
	}
	// The server removes x-next-internal-* headers before dispatch, so such a
	// header could never select an output.
	if strings.HasPrefix(strings.ToLower(header), "x-next-internal-") {
		panic("route.go adapter server cannot select outputs with an x-next-internal-* header")
	}
	header = textproto.CanonicalMIMEHeaderKey(header)
	return func(w http.ResponseWriter, r *http.Request) {
		values := r.Header.Values(header)
		if len(values) != 1 {
			http.NotFound(w, r)
			return
		}
		handler, ok := nextGoLookupRoute(routes, values[0])
		if !ok {
			http.NotFound(w, r)
			return
		}
		handler(w, r)
	}
}

// nextGoLookupRoute matches a routing header value to an output ID. The value is
// the output ID percent-encoded, and it is decoded exactly once. It is never also
// matched raw: output IDs can contain "%", so trying both spellings would let one
// value name two outputs, such as /x/%5Bid%5D naming both the literal
// /x/%5Bid%5D route and, decoded, the dynamic /x/[id] route. An ID without "%"
// decodes to itself, so platforms may send such IDs unencoded.
func nextGoLookupRoute(routes map[string]http.HandlerFunc, value string) (http.HandlerFunc, bool) {
	id, err := url.PathUnescape(value)
	if err != nil {
		return nil, false
	}
	handler, ok := routes[id]
	return handler, ok
}

func nextGoValidHeaderName(name string) bool {
	if name == "" {
		return false
	}
	for _, ch := range name {
		// RFC 9110 token characters.
		if ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' {
			continue
		}
		if !strings.ContainsRune("!#$%&'*+-.^_`|~", ch) {
			return false
		}
	}
	return true
}
