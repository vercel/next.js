import path from 'path'
import { promises as fs } from 'fs'

// Write .vscode settings to enable Next.js typescript plugin.
export async function writeVscodeConfigurations(
  baseDir: string
): Promise<void> {
  const vscodeSettings = path.join(baseDir, '.vscode', 'settings.json')
  let settings: any = {}
  let currentContent: string = ''

  try {
    currentContent = await fs.readFile(vscodeSettings, 'utf8')
    settings = JSON.parse(currentContent)
  } catch (err) {}

  const libPath =
    '.' + path.sep + path.join('node_modules', 'typescript', 'lib')
  if (
    settings['typescript.tsdk'] === libPath &&
    settings['typescript.enablePromptUseWorkspaceTsdk']
  ) {
    return
  }

  settings['typescript.tsdk'] = libPath
  settings['typescript.enablePromptUseWorkspaceTsdk'] = true

  const content = JSON.stringify(settings, null, 2)

  const vscodeFolder = path.join(baseDir, '.vscode')
  try {
    await fs.lstat(vscodeFolder)
  } catch (e) {
    await fs.mkdir(vscodeFolder, { recursive: true })
  }

  await fs.writeFile(vscodeSettings, content)

  // Write to .gitignore if it exists
  const gitIgnore = path.join(baseDir, '.gitignore')
  try {
    const gitIgnoreContent = await fs.readFile(gitIgnore, 'utf8')
    if (!gitIgnoreContent.includes('.vscode')) {
      await fs.writeFile(gitIgnore, `${gitIgnoreContent}\n.vscode\n`)
    }
  } catch (e) {
    await fs.writeFile(gitIgnore, `.vscode\n`)
  }
}
