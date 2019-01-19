export async function generateBuildId (generate: () => string|null, fallback: () => string): Promise<string> {
  let buildId = await generate()
  // If there's no buildId defined we'll fall back
  if (buildId === null) {
    buildId = fallback()
  }

  if (typeof buildId !== 'string') {
    throw new Error('generateBuildId did not return a string. https://err.sh/zeit/next.js/generatebuildid-not-a-string')
  }

  return buildId.trim()
}
