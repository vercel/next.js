import { promises } from 'fs'
import { join } from 'path'

export async function checkNextScriptImport(
  pagePaths: string[],
  pagesDir: string
): Promise<boolean> {
  for (const page of pagePaths) {
    const fileContent = await promises.readFile(join(pagesDir, page), 'utf8')
    if (/import[^}]*.*('|")next\/script('|")/.test(fileContent)) {
      return true
    }
  }

  return false
}
