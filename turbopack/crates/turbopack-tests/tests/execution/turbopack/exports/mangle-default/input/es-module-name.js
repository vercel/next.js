// `__esModule` is how a CommonJS module signals interop *to* ESM; the runtime defines it on the
// exports object itself. An ESM module that happens to export that name is just an ordinary export,
// so its key is mangled like any other — and the runtime's own `__esModule` is untouched.

export const __esModule = 'a-normal-export'
export const someLongExportName = 'named-value'

export const exportsInfo = {
  __esModule: __webpack_exports_info__.__esModule,
}
