/**
 * filepath   export      module key
 * "file"     '*'         "file"
 * "file"     ''          "file#"
 * "file"     '<named>'   "file#<named>"
 *
 * @param filepath file path to the module
 * @param exports '' | '*' | '<named>'
 */
export function getClientReferenceModuleKey(
  filepath: string,
  exportName: string
): string {
  return exportName === '*' ? filepath : filepath + '#' + exportName
}

export function isClientReference(reference: any): boolean {
  return reference?.$$typeof === Symbol.for('react.client.reference')
}
