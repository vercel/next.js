// Returns the public named exports exposed by an ESM namespace. `default` and
// the CommonJS interop marker are checked separately or ignored, respectively.
function getNamedExports(esmNamespace) {
  return Object.keys(esmNamespace).filter(
    (exportName) => exportName !== 'default' && exportName !== '__esModule'
  )
}

// Checks export presence without requiring a value to be defined. Some public
// exports, such as `next/client`'s router, are intentionally undefined early in
// the module lifecycle.
function hasExport(object, exportName) {
  return object != null && exportName in Object(object)
}

// Verifies that every ESM named export is also present on the CommonJS module
// and resolves to the exact same value. Access errors count as mismatches.
function namedExportsMatch(esmNamespace, commonJs) {
  try {
    const namedExports = getNamedExports(esmNamespace)

    return namedExports.every(
      (exportName) =>
        hasExport(commonJs, exportName) &&
        esmNamespace[exportName] === commonJs[exportName]
    )
  } catch {
    return false
  }
}

// For APIs whose primary export is a value (usually a component), verifies the
// default export identity across ESM syntax, the ESM namespace, and CommonJS,
// then compares every co-located named export against CommonJS.
export function defaultExportMatches(esmDefault, esmNamespace, commonJs) {
  return (
    esmDefault !== undefined &&
    esmNamespace.default !== undefined &&
    commonJs.default !== undefined &&
    esmDefault === esmNamespace.default &&
    esmDefault === commonJs.default &&
    namedExportsMatch(esmNamespace, commonJs)
  )
}

// For APIs whose default export is a namespace object, verifies every named
// export across that object, the ESM namespace, and CommonJS. `requiredExport`
// prevents an empty or entirely undefined namespace from passing vacuously.
export function namespaceExportsMatch(
  esmDefault,
  esmNamespace,
  commonJs,
  requiredExport
) {
  const namedExports = getNamedExports(esmNamespace)

  try {
    return (
      esmDefault !== undefined &&
      namedExports.length > 0 &&
      esmNamespace[requiredExport] !== undefined &&
      commonJs[requiredExport] !== undefined &&
      namedExportsMatch(esmNamespace, commonJs) &&
      namedExports.every(
        (exportName) =>
          hasExport(esmDefault, exportName) &&
          esmDefault[exportName] === esmNamespace[exportName]
      )
    )
  } catch {
    return false
  }
}
