# Browser assets for native Go routes

Generated with `pnpm new-test --args true native-route-browser-assets e2e`.

The application has its own module name and requires `next/go`. Test preparation
maps it with a directory replacement to the SDK shipped in the installed `next`
package, as `next dev` does, so nothing is downloaded. The route imports
`next/go/assets` with an alias, and `go list` independently verifies ordinary Go
tooling resolves that import. No browser assets are embedded in Go.

Run in development and production with Turbopack. The fixture verifies browser
execution, imported CSS, lazy imports, deduplication, optional production entries,
manifest transport filtering, and dependency edits without Go worker restarts.

The deployment harness currently has no Go-capable adapter, as documented in
`../native-route-go/README.md`. This suite runs against `next dev` and `next start`.
