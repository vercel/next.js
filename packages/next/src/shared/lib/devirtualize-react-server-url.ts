/**
 * This function is used to devirtualize the source URL of a React server component.
 * It is used to convert the `about://React/Server/file://<filename>` to `file://<filename>`.
 */
export function devirtualizeReactServerURL(sourceURL: string): string {
  if (sourceURL.startsWith('about://React/')) {
    const envIdx = sourceURL.indexOf('/', 'about://React/'.length)
    const suffixIdx = sourceURL.lastIndexOf('?')
    if (envIdx > -1 && suffixIdx > -1) {
      return decodeURI(sourceURL.slice(envIdx + 1, suffixIdx))
    }
  }

  return sourceURL
}
