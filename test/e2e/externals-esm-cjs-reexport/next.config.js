module.exports = {
  // `button-pkg` is externalized (resolved at runtime by Node.js). Because it is
  // an ESM package, Turbopack loads it via `import()` (`externalImport`), which
  // means Node's strict ESM resolver walks its transitive re-exports.
  serverExternalPackages: ['button-pkg'],
}
