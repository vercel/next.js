import { promises as fs } from 'fs'

import * as CommentJson from 'next/dist/compiled/comment-json'

export type LintIntent = { firstTimeSetup: boolean }

export async function getLintIntent(
  eslintrcFile: string | null,
  pkgJsonEslintConfig: string | null
): Promise<LintIntent | false> {
  if (eslintrcFile) {
    const content = await fs.readFile(eslintrcFile, { encoding: 'utf8' }).then(
      (txt) => txt.trim().replace(/\n/g, ''),
      () => null
    )

    // User is setting up ESLint for the first time setup if eslint config exists but is empty
    return {
      firstTimeSetup:
        content === '' ||
        content === '{}' ||
        content === '---' ||
        content === 'module.exports = {}',
    }
  } else if (pkgJsonEslintConfig) {
    return {
      firstTimeSetup: CommentJson.stringify(pkgJsonEslintConfig) === '{}',
    }
  }

  return false
}
