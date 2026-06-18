import path from 'path'

export function getAppRelativeEditorPath(
  relativeFilePath: string,
  isSrcDir: boolean
) {
  return path.join(isSrcDir ? 'src' : '', 'app', relativeFilePath)
}
