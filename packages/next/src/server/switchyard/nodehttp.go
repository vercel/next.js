package main

// Node parity: what Node's HTTP server shows the app and sends the client,
// where Go's server and proxy differ. Shared by the paths that answer for
// Node.

import (
	"net/http"
	"net/textproto"
	"strings"
)

// The hop-by-hop headers Go's proxy removes from every request and response
// (hopHeaders in net/http/httputil), besides Connection and the headers it
// names, that Node's server passes on: it shows the app every header the
// client sent, and sends the client every header the app set. Not among them:
// Transfer-Encoding and Trailer, which describe a body that Go's Transport
// and server frame themselves.
var hopHeaders = []string{"Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "Proxy-Connection", "Te", "Upgrade"}

// connectionNames returns the header names h's Connection header lists,
// canonicalized as Go's proxy reads them (removeHopByHopHeaders).
func connectionNames(h http.Header) []string {
	var names []string
	for _, field := range h["Connection"] {
		for _, name := range strings.Split(field, ",") {
			if name = textproto.TrimString(name); name != "" {
				names = append(names, textproto.CanonicalMIMEHeaderKey(name))
			}
		}
	}
	return names
}

// restoreHopHeaders copies into out, the request to Node, the hop-by-hop
// headers of in, the client's request: Connection, hopHeaders and the headers
// Connection names. The client's values replace what the proxy set in their
// place: "Te: trailers" for a TE that lists trailers, and "Connection:
// Upgrade" for an upgrade request, whose client value lists upgrade too.
func restoreHopHeaders(out, in http.Header) {
	restore := func(name string) {
		if values, ok := in[name]; ok && name != "Transfer-Encoding" && name != "Trailer" {
			out[name] = values
		}
	}
	restore("Connection")
	for _, name := range hopHeaders {
		restore(name)
	}
	for _, name := range connectionNames(in) {
		restore(name)
	}
}
