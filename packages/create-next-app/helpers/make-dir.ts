import fs from 'fs'

export async function makeDir(
  root: string,
  options = { recursive: true }
): Promise<void> {
  await fs.promises.mkdir(root, options)
  return
}
