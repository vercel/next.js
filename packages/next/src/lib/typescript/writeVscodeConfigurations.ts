import path from 'path'
import isError from '../is-error'
import { promises as fs } from 'fs'
import * as Log from '../../build/output/log'
import * as CommentJson from 'next/dist/compiled/comment-json'

// Write .vscode settings to enable Next.js typescript plugin.
export async function writeVscodeConfigurations(
  baseDir: string,
  tsPath: string
): Promise<void> {
  try {
    const vscodeSettings = path.join(baseDir, '.vscode', 'settings.json')
    let settings: any = {}
    let configExists = false
    let currentContent: string = ''

    try {
      currentContent = await fs.readFile(vscodeSettings, 'utf8')
      settings = CommentJson.parse(currentContent)
      configExists = true
    } catch (err) {
      if (isError(err) && err.code !== 'ENOENT') {
        throw err
      }
    }

    if (
      settings['typescript.tsdk'] &&
      settings['typescript.enablePromptUseWorkspaceTsdk']
    ) {
      return
    }

    const libPath = path.relative(baseDir, path.dirname(tsPath))

    settings['typescript.tsdk'] = libPath
    settings['typescript.enablePromptUseWorkspaceTsdk'] = true

    const content = CommentJson.stringify(settings, null, 2)
    const vscodeFolder = path.join(baseDir, '.vscode')

    try {
      await fs.lstat(vscodeFolder)
    } catch (e) {
      await fs.mkdir(vscodeFolder, { recursive: true })
    }
    await fs.writeFile(vscodeSettings, content)

    Log.info(
      `VS Code settings.json has been ${
        configExists ? 'updated' : 'created'
      } for Next.js' automatic app types, this file can be added to .gitignore if desired`
    )
  } catch (err) {
    Log.error(
      `Failed to apply custom vscode config for Next.js' app types`,
      err
    )
  }
}
