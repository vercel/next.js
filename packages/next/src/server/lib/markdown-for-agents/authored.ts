import { promises as fs } from 'fs'
import { dirname, join } from 'path'

export type AuthoredRepresentation = {
  markdown?: string
  plain?: string
}

async function readIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return undefined
  }
}

function pageDirFromFilename(filename: string | undefined): string | undefined {
  if (!filename) return undefined
  return dirname(filename)
}

/**
 * Locate colocated `page.md` / `page.txt` for an App Router page.
 * Tries the compiled/source filename directory, then `app/` and `src/app/`
 * under the project dir using the route page path (`/about` → `app/about/page.md`).
 */
export async function loadAuthoredRepresentation(options: {
  dir: string
  pageFilename?: string
  page?: string
}): Promise<AuthoredRepresentation> {
  const candidates: string[] = []
  const fileDir = pageDirFromFilename(options.pageFilename)
  if (fileDir) candidates.push(fileDir)

  const page = options.page?.replace(/\/page$/, '') || ''
  const routeDir = page === '/' || page === '' ? '' : page.replace(/^\//, '')
  for (const root of ['app', 'src/app']) {
    candidates.push(join(options.dir, root, routeDir))
  }

  let markdown: string | undefined
  let plain: string | undefined
  const seen = new Set<string>()
  for (const dir of candidates) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    if (!markdown) markdown = await readIfExists(join(dir, 'page.md'))
    if (!plain) plain = await readIfExists(join(dir, 'page.txt'))
    if (markdown && plain) break
  }
  return { markdown, plain }
}
