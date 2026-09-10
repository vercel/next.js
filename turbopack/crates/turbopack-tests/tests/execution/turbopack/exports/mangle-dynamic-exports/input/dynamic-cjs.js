// A CommonJS module whose exports can't be determined statically, so a re-export of it has to be
// resolved at runtime by property access on the original names.
const key = 'dynamicallyNamedExport'
exports[key] = 'dynamic-value'
exports.staticallyNamedExport = 'static-value'
