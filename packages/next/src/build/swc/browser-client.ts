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

/** Coverage needs concrete native output provenance, independently of client support. */
export function requireBrowserCoverageCapability(
  binding: { projectTestEntryBrowserCoverageVersion?: () => number },
  requested: boolean
) {
  if (!requested) return
  const version =
    typeof binding.projectTestEntryBrowserCoverageVersion === 'function'
      ? binding.projectTestEntryBrowserCoverageVersion()
      : 0
  if (!Number.isInteger(version) || version < 1)
    throw new Error(
      'The installed Turbopack binding does not support native Browser Mode coverage certificates.'
    )
}

type NativeCompilerFeatures = [
  boolean?,
  boolean?,
  boolean?,
  string[]?,
  boolean?,
  string?,
]

/** Preserve every old native call shape unless this distinct opt-in is requested. */
export function withNativeBrowserSourceCoverage(
  binding: { projectTestEntryBrowserSourceCoverageVersion?: () => number },
  features: NativeCompilerFeatures,
  requested: boolean
): [...NativeCompilerFeatures, boolean?] {
  if (!requested) return features
  const [
    dependency = false,
    client = false,
    nodeCoverage = false,
    aliases = [],
    importRoles = false,
    revision,
  ] = features
  if (!client || nodeCoverage)
    throw new Error('Browser source coverage requires its actual client entry.')
  if (
    typeof binding.projectTestEntryBrowserSourceCoverageVersion !==
      'function' ||
    binding.projectTestEntryBrowserSourceCoverageVersion() !== 1
  )
    throw new Error(
      'The installed Turbopack binding does not support source-preserving production Browser coverage.'
    )
  return [
    dependency,
    client,
    nodeCoverage,
    aliases,
    importRoles,
    revision,
    true,
  ]
}
