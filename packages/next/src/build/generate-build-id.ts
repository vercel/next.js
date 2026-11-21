export async function generateBuildId(
  generate: (() => string | null | Promise<string | null>) | undefined,
  fallback: () => string
): Promise<string> {
  let buildId = generate ? await generate() : null
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

  buildId = buildId.trim()

  // The build ID is used as a single URL path segment (`/_next/data/<id>/…`,
  // `/_next/static/<id>/…`) and as a directory name, so it must not be empty
  // or contain characters that would split or end that segment.
  if (buildId.length === 0 || /[/\\?#\s]/.test(buildId)) {
    throw new Error(
      `generateBuildId returned ${JSON.stringify(buildId)}, which can't be used as a build ID. It must not be empty and must not contain "/", "\\", "?", "#" or whitespace. https://nextjs.org/docs/messages/generatebuildid-invalid-characters`
    )
  }

  return buildId
}
