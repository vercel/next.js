// Next.js resolves its public entrypoints differently per bundler layer, so the
// *shape* of a given entry is not uniform. `next/navigation` has no default
// export, `next/error` collapses to just `catchError` in the react-server
// layer, and `next/link` resolves to a different component in the App Router
// than in the Pages Router. These helpers describe the observed surface of an
// entry so each layer can assert its own expected shape instead of assuming one
// shared contract.

// Returns the public named exports exposed by an ESM namespace. `default` and
// the CommonJS interop marker are checked separately or ignored, respectively.
function getNamedExports(esmNamespace) {
  return Object.keys(esmNamespace).filter(
    (exportName) => exportName !== 'default' && exportName !== '__esModule'
  )
}

// Checks export presence without requiring a value to be defined. Some public
// exports, such as `next/client`'s router, are intentionally undefined early in
// the module lifecycle.
function hasExport(object, exportName) {
  return object != null && exportName in Object(object)
}

// Describes which module an entrypoint resolved to, as a stable string.
//
// `markers` is a curated list of exports that identify the target module, so a
// change in aliasing (for example the react-server variant of `next/navigation`
// no longer being used) shows up as a diff. The full `Object.keys` listing is
// deliberately not snapshotted: it picks up incidental members such as a
// component's `displayName` in development, or `__nextScript` under one
// bundler, which would make the snapshot churn without describing the API.
//
// `defaultBinding` is the `import x from '...'` form. It is passed in (rather
// than read off the namespace) so the binding is genuinely used: an unused
// default import is elided by the bundler, which would silently drop the
// build-time coverage that default-importing a default-less entry is an error.
export function describeEntry(defaultBinding, esmNamespace, commonJs, markers) {
  const named = getNamedExports(esmNamespace)

  return [
    `default:${defaultBinding !== undefined ? 'yes' : 'no'}`,
    // Both ESM import forms must agree on whether a default export exists.
    `namespace-default:${esmNamespace.default !== undefined ? 'yes' : 'no'}`,
    // Markers the entry is missing. Expected to be empty for every entry.
    `absent-markers:${markers.filter((marker) => !hasExport(esmNamespace, marker)).join(',')}`,
    // Named exports ESM exposes but CommonJS does not. Expected to be empty:
    // the two forms must agree on the surface even where the bundler hands out
    // distinct wrapper objects.
    `missing-from-cjs:${named.filter((exportName) => !hasExport(commonJs, exportName)).join(',')}`,
  ].join(' ')
}
