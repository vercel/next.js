// Package shim re-exports a route package for the adapter entrypoint that
// Next.js generates. Go's internal visibility rules prevent that entrypoint
// from importing the route package directly. It is not part of the route API.
package shim

import (
	"net/http"

	next "__NEXT_GO_ROUTE_IMPORT__"
)

func NextInternalGoHandler(trustInternalHeaders bool) http.HandlerFunc {
	return next.NextInternalGoHandler(trustInternalHeaders)
}
