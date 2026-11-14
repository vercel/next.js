# Browser assets for native Go routes

Generated with `pnpm new-test --args true native-route-browser-assets e2e`.

The application has its own module name and maps `next/go` to a pinned SDK
module using a normal `require`/`replace` pair. Test preparation archives the real
SDK source on an isolated file proxy and populates a private module cache using
`go mod download`. Turbopack then compiles the route with downloads disabled.
The route imports `next/go/assets` with an alias, and `go list` independently
verifies ordinary Go tooling resolves that import. No browser assets are embedded
in Go, and the fixture does not pretend to be the SDK module itself.

Run in development and production with Turbopack. The fixture verifies browser
execution, imported CSS, lazy imports, deduplication, optional production entries,
manifest transport filtering, and dependency edits without Go worker restarts.

The deployment harness currently has no Go-capable adapter, as documented in
`../native-route-go/README.md`. This suite runs against `next dev` and `next start`.
