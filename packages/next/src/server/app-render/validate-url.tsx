export function validateURL(url: string | undefined): string {
  if (!url) {
    throw new Error('Invalid request URL')
  }
  try {
    new URL(url, 'http://n')
    return url
  } catch {
    throw new Error('Invalid request URL')
  }
}
