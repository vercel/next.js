// Next.js resolves its public entrypoints differently per bundler layer, so the
// *shape* of a given entry is not uniform. `next/navigation` has no default
// export, `next/error` collapses to just `catchError` in the react-server
// layer, and `next/link` resolves to a different component in the App Router
// than in the Pages Router. These helpers describe the observed surface of an
// entry so each layer can assert its own expected shape instead of assuming one
// shared contract.

// `default` is checked separately, `__esModule` is the CommonJS interop marker,
// and `then`/`catch`/`finally` are thenable members that client-reference
// proxies expose in the react-server layer. None of them are public API.
const NON_API_EXPORTS = new Set([
  'default',
  '__esModule',
  'then',
  'catch',
  'finally',
])

// Returns the public named exports exposed by an ESM namespace.
function getNamedExports(esmNamespace) {
  return Object.keys(esmNamespace).filter(
    (exportName) => !NON_API_EXPORTS.has(exportName)
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

  const absentMarkers = markers
    .filter((marker) => !hasExport(esmNamespace, marker))
    .join(',')
  const missingFromCjs = named
    .filter((exportName) => !hasExport(commonJs, exportName))
    .join(',')

  return [
    defaultBinding !== undefined ? `default` : undefined,
    // Both ESM import forms must agree on whether a default export exists.
    esmNamespace.default !== undefined ? `namespace-default` : undefined,
    // Whether the value itself is callable. Entries whose primary export is a
    // function -- `next/dynamic`, `next/head`, `next/script` -- are callable
    // directly off `require()`, so `const dynamic = require('next/dynamic')`
    // followed by `dynamic(...)` works. Collapsing one of those to a plain
    // `{ default }` object would break that call without removing any export,
    // so presence checks alone cannot catch it.
    typeof defaultBinding === 'function' ? `default-callable` : undefined,
    typeof commonJs === 'function' ? `cjs-callable` : undefined,
    // For those entries `module.exports` is the function *and* carries a
    // self-referencing `.default`, which is what lets the same module serve
    // `require()` and `import` callers.
    commonJs !== undefined && commonJs === commonJs.default
      ? `cjs-is-own-default`
      : undefined,
    // Markers the entry is missing. Expected to be empty for every entry.
    absentMarkers ? `absent-markers:${absentMarkers}` : undefined,
    // Named exports ESM exposes but CommonJS does not. Expected to be empty:
    // the two forms must agree on the surface even where the bundler hands out
    // distinct wrapper objects.
    missingFromCjs ? `missing-from-cjs:${missingFromCjs}` : undefined,
  ]
    .filter(Boolean)
    .join(' ')
}

// Use this for entrypoints that do not statically declare a default export.
// Accessing `namespace.default` at the import site makes webpack request that
// export and emit a warning. Looking it up through an ordinary function
// parameter still records a synthesized runtime default when one exists.
export function describeNamespaceEntry(esmNamespace, commonJs, markers) {
  return describeEntry(esmNamespace.default, esmNamespace, commonJs, markers)
}
