import { posix } from 'path'

export function getHTMLFilename(
  pathname: string,
  context: { subFolders: boolean }
): string {
  if (context.subFolders) {
    return `${pathname}${posix.sep}index.html`
  }

  return `${pathname}.html`
}
