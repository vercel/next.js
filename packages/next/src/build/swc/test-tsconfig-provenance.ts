type CompilerFeatures = [boolean?, boolean?, boolean?, string[]?, boolean?]
type NativeCompilerFeatures = [...CompilerFeatures, string?]

/** Private qualification only. None preserves the old native ABI exactly. */
export function withNativeTsConfigRevision(
  binding: { projectTestEntryTsConfigInputsVersion?: () => number },
  features: CompilerFeatures,
  revision: string | undefined
): NativeCompilerFeatures {
  if (revision === undefined) return features
  if (
    typeof revision !== 'string' ||
    revision.length === 0 ||
    revision.includes('\0') ||
    new TextEncoder().encode(revision).byteLength > 256
  )
    throw new Error(
      'Native TypeScript config provenance requires an opaque parent revision'
    )
  if (
    typeof binding.projectTestEntryTsConfigInputsVersion !== 'function' ||
    binding.projectTestEntryTsConfigInputsVersion() !== 1
  )
    throw new Error(
      'Native TypeScript config provenance requires capability version 1'
    )
  const [
    dependencyPlan = false,
    browserClient = false,
    sourceCoverage = false,
    aliases = [],
    importRoles = false,
  ] = features
  return [
    dependencyPlan,
    browserClient,
    sourceCoverage,
    aliases,
    importRoles,
    revision,
  ]
}
