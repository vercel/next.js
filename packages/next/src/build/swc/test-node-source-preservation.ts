type NativeCompilerFeatures = [
  boolean?,
  boolean?,
  boolean?,
  string[]?,
  boolean?,
  string?,
  boolean?,
]

/** False preserves all old argument shapes, including absent trailing features. */
export function withNativeNodeSourcePreservation(
  binding: { projectTestEntryPreserveCoverageSourcesVersion?: () => number },
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
    browserCoverage = false,
  ] = features
  if (dependency || client || nodeCoverage || browserCoverage)
    throw new Error(
      'Source preservation requires an isolated development Node entry'
    )
  if (
    typeof binding.projectTestEntryPreserveCoverageSourcesVersion !==
      'function' ||
    binding.projectTestEntryPreserveCoverageSourcesVersion() !== 1
  )
    throw new Error(
      'The installed Turbopack binding does not support source preservation for development Node coverage.'
    )
  return [
    dependency,
    client,
    nodeCoverage,
    aliases,
    importRoles,
    revision,
    browserCoverage,
    true,
  ]
}
