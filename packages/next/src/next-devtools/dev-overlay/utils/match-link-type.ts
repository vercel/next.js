export function matchLinkType(text: string): string | null {
  if (text.startsWith('https://nextjs.org')) {
    return 'nextjs-link'
  }
  if (text.startsWith('https://') || text.startsWith('http://')) {
    return 'external-link'
  }
  return null
}
