// An enumerated dynamic import is a partial namespace read of the barrel: the used names are known,
// but the promise resolves to the namespace object, which exposes the original names.
export async function readLate() {
  const { veryLongLateNamespaceExportName } = await import(
    /* webpackExports: ["veryLongLateNamespaceExportName"] */ './barrel'
  )
  return veryLongLateNamespaceExportName
}
