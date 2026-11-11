/** Private import roles require both native contracts before endpoint emission. */
export function requireImportCoverageCapability(
  binding: {
    projectTestEntryImportCoverageVersion?: () => number
    projectTestEntrySourceCoverageVersion?: () => number
  },
  required: boolean
): void {
  if (
    required &&
    (typeof binding.projectTestEntryImportCoverageVersion !== 'function' ||
      binding.projectTestEntryImportCoverageVersion() !== 1 ||
      typeof binding.projectTestEntrySourceCoverageVersion !== 'function' ||
      binding.projectTestEntrySourceCoverageVersion() !== 1)
  )
    throw new Error(
      'Native import coverage roles require source and import capability version 1'
    )
}
