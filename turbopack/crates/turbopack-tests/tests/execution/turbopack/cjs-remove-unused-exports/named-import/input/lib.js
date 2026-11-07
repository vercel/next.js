globalThis.__cjs_impure_ran = false

exports.used = 'used-value'
// Unused + pure: expected to be dropped from the output entirely.
exports.unused = 'unused-value'
// Unused but impure: the assignment is removable, yet its side-effecting RHS must
// still run, so this statement is kept.
exports.impure = globalThis.__cjs_impure_ran = true
