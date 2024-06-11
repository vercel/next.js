import fs from 'fs-extra'

export interface PatchServerFileOptions {
  readonly minimalMode: boolean
}

export async function patchServerFile(
  serverFilename: string,
  options: PatchServerFileOptions
): Promise<void> {
  const { minimalMode } = options
  const content = await fs.readFile(serverFilename, 'utf8')

  await fs.writeFile(
    serverFilename,
    content.replace(
      /(startServer\({\s*)(minimalMode: (true|false),\n {2})?/,
      `$1minimalMode: ${minimalMode},\n  `
    )
  )
}
