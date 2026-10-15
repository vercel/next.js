/** Older bindings ignore optional trailing arguments; negotiate before emission. */
export function requireBrowserClientCapability(
  binding: { projectTestEntryBrowserClientVersion?: () => number },
  requested: boolean
) {
  if (!requested) return
  const version =
    typeof binding.projectTestEntryBrowserClientVersion === 'function'
      ? binding.projectTestEntryBrowserClientVersion()
      : 0
  if (!Number.isInteger(version) || version < 1)
    throw new Error(
      'The installed Turbopack binding does not support actual Browser Mode client entries.'
    )
}
