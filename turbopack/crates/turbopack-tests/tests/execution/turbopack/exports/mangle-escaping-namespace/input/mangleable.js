// Nothing escapes here: every export is read by name, so this module *is* mangled even though
// another module in the same graph had to back off. Back-off is per module.

export const someLongExportName = 'mangled-1'
export const anotherLongExportName = 'mangled-2'

export const exportsInfo = {
  someLongExportName: __webpack_exports_info__.someLongExportName,
  anotherLongExportName: __webpack_exports_info__.anotherLongExportName,
}
