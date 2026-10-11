/** Setup identities are compiler inputs, never filenames for a host loader. */
export function assertCompiledSetup(
  artifact: { setupFiles?: readonly string[] },
  requested: readonly string[]
): void {
  const compiled = artifact.setupFiles ?? []
  if (
    compiled.length !== requested.length ||
    compiled.some((file, index) => file !== requested[index])
  ) {
    throw new Error(
      'Compiled setup files do not match the requested setup order; recompile the test'
    )
  }
}
