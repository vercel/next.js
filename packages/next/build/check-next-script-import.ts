import { promises } from 'fs'
import { join } from 'path'

export async function checkNextScriptImport(
  pagePaths: string[],
  pagesDir: string
): Promise<boolean> {
  let isNextScriptImported = false
  await Promise.all(
    pagePaths.map(async (page) => {
      if (isNextScriptImported) return

      const fileContent = await promises.readFile(join(pagesDir, page), 'utf8')
      if (
        fileContent.includes('next/script') ||
        fileContent.includes('next/dist/client/script')
      ) {
        isNextScriptImported = true
      }
    })
  )
  return isNextScriptImported
}
