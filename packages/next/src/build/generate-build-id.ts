export async function generateBuildId(
  fallback: () => string,
  generate?: (() => string | null | Promise<string | null>)
): Promise<string> {
  let buildId = null
  if (typeof generate === 'function') {
    buildId = await generate()
  }
  // If there's no buildId defined we'll fall back
  if (buildId === null) {
    // We also create a new buildId if it contains the word `ad` to avoid false
    // positives with ad blockers
    while (!buildId || /ad/i.test(buildId)) {
      buildId = fallback()
    }
  }

  if (typeof buildId !== 'string') {
    throw new Error(
      'generateBuildId did not return a string. https://nextjs.org/docs/messages/generatebuildid-not-a-string'
    )
  }

  return buildId.trim()
}
