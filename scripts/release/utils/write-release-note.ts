import type { ChangelogInfo } from '../utils'

/**
 * @example
 * ```markdown
 * ## `next@15.4.0`
 *
 * ### Minor Changes
 *
 * - ... #12345
 *
 * ### Patch Changes
 *
 * - ... #12345
 *
 * ## `create-next-app@15.0.0`
 *
 * ### Minor Changes
 *
 * - ... #12345
 *
 * ## Credits
 *
 * Huge thanks to ... for helping!
 * ```
 */
export function writeReleaseNote(
  changelogs: Record<string, ChangelogInfo>,
  credits: string[]
): string {
  const creditsAsHandles = credits.map((credit) => `@${credit}`)
  let releaseNote = ''

  for (const [packageName, { version, changelog }] of Object.entries(
    changelogs
  )) {
    releaseNote += `## \`${packageName}@${version}\`\n\n${changelog}\n\n`
  }

  // If there are multiple credits, format the list as
  // "@foo, @bar, and @baz"; if there is only one credit,
  // format it as "@foo".
  const thanksList =
    creditsAsHandles.length > 1
      ? creditsAsHandles.slice(0, -1).join(', ') +
        ', and ' +
        creditsAsHandles.slice(-1)
      : creditsAsHandles[0]
  const thanksTo = `Huge thanks to ${thanksList} for helping!`
  releaseNote += `## Credits\n\n${thanksTo}`

  return releaseNote
}
