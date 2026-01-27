// Original module with long export names
// When mangling is enabled, all ESM modules are split into locals+facade
export const veryLongOriginalExportName = 'from-a'
export function anotherLongFunctionName() {
  return 'func-a'
}

// Default export
export default function defaultExportFromA() {
  return 'default-from-a'
}

// Export __webpack_exports_info__ to verify mangling
export const exportsInfo = __webpack_exports_info__
