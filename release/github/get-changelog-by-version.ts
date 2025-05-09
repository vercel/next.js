export function getChangelogByVersion(
  markdown: string,
  version: string
): string {
  const lines = markdown.split('\n')
  const header = `## ${version}`
  const section: string[] = []
  let collecting = false

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (line.trim() === header) {
        collecting = true
        continue // skip the header itself
      } else if (collecting) {
        break // reached the next version
      }
    }
    if (collecting) {
      section.push(line)
    }
  }
  return section.join('\n').trim()
}
