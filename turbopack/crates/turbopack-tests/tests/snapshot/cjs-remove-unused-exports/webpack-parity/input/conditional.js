// Top-level control-flow writes remain statically named exports.
const condition =
  (globalThis.CJS_PARITY_TRACE.push('conditional:condition'), false)
if (condition) {
  exports.used = 'USED_CONDITIONAL_THEN'
  exports.unused =
    (globalThis.CJS_PARITY_TRACE.push('conditional:unused-rhs-then'),
    'UNUSED_CONDITIONAL_THEN')
} else {
  exports.used = 'USED_CONDITIONAL_ELSE'
  exports.unused =
    (globalThis.CJS_PARITY_TRACE.push('conditional:unused-rhs-else'),
    'UNUSED_CONDITIONAL_ELSE')
}
