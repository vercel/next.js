// Package visibility is only importable by packages below app. Routes import it
// to check that their compiled package keeps Go's internal visibility.
package visibility

const Name = "app-internal"
