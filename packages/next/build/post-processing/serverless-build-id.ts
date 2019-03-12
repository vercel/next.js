import { readFile, writeFile } from 'fs'
import MagicString from 'magic-string'
import path from 'path'
import { promisify } from 'util'

import { recursiveReadDir } from '../../lib/recursive-readdir'

const readFileP = promisify(readFile)
const writeFileP = promisify(writeFile)

const NEXT_REPLACE_BUILD_ID = '__NEXT_REPLACE__BUILD_ID__'

export async function injectBuildId(distDir: string, buildId: string) {
  const serverlessPagesDirectory = path.resolve(
    '.',
    distDir,
    'serverless',
    'pages'
  )
  const pages = await recursiveReadDir(serverlessPagesDirectory, /\.js$/)

  for (const page of pages) {
    const pagePath = path.join(serverlessPagesDirectory, page)

    const contents = await readFileP(pagePath, 'utf8')
    const f = new MagicString(contents)

    const regex = new RegExp(NEXT_REPLACE_BUILD_ID, 'g')
    let result
    while ((result = regex.exec(contents))) {
      f.overwrite(
        result.index,
        result.index + NEXT_REPLACE_BUILD_ID.length,
        buildId
      )
    }

    await writeFileP(pagePath, f.toString())
  }
}
