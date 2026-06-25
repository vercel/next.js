module.exports = {
  // Force `dual-pkg` to be externalized (resolved at runtime by Node.js instead
  // of bundled). This is the code path the externalization bug lives in.
  serverExternalPackages: ['dual-pkg'],
}
