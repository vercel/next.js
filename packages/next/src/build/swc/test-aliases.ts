/** Older native bindings ignore appended arguments, so negotiate first. */
export function requireCompilerAliasCapability(
  binding: { projectTestEntryAliasVersion?: () => number },
  required: boolean
): void {
  if (
    required &&
    (typeof binding.projectTestEntryAliasVersion !== 'function' ||
      binding.projectTestEntryAliasVersion() !== 1)
  )
    throw new Error(
      'The installed Turbopack binding does not support raw-request compiler alias boundaries.'
    )
}
