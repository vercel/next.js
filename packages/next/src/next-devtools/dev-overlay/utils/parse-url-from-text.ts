export function parseUrlFromText(
  text: string,
  matcherFunc?: (text: string) => boolean
): string[] {
  const linkRegex = /https?:\/\/[^\s/$.?#].[^\s)'"]*/gi
  const links = Array.from(text.matchAll(linkRegex), (match) => match[0])

  if (matcherFunc) {
    return links.filter((link) => matcherFunc(link))
  }

  return links
}
