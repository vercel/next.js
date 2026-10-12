// Reached only through `import()`. Even with a `webpackExports` / `turbopackExports` comment
// telling us which exports are used, the namespace object that `import()` resolves to is handed
// to user code and destructured by the *original* names, so this module must not be mangled.

export const usedName = 'used'
export const otherUsedName = 'other-used'
export const unusedName = 'unused'

export const exportsInfo = {
  usedName: __webpack_exports_info__.usedName,
  otherUsedName: __webpack_exports_info__.otherUsedName,
}
