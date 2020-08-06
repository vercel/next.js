//  issuer.endsWith(path.posix.sep) || issuer.endsWith(path.win32.sep)
import findUp from 'next/dist/compiled/find-up'
import * as path from 'path'
import { promises as fs } from 'fs'
import JSON5 from 'next/dist/compiled/json5'
import { resolveRequest } from './resolve-request'

export async function getPackageVersion({
  cwd,
  name,
}: {
  cwd: string
  name: string
}): Promise<string | null> {
  const configurationPath: string | undefined = await findUp('package.json', {
    cwd,
  })
  if (!configurationPath) {
    return null
  }

  const content = await fs.readFile(configurationPath, 'utf-8')
  const packageJson: any = JSON5.parse(content)

  const { dependencies = {}, devDependencies = {} } = packageJson || {}
  if (!(dependencies[name] || devDependencies[name])) {
    return null
  }

  const cwd2 =
    cwd.endsWith(path.posix.sep) || cwd.endsWith(path.win32.sep)
      ? cwd
      : `${cwd}/`

  try {
    const targetPath = resolveRequest(`${name}/package.json`, cwd2)
    const targetContent = await fs.readFile(targetPath, 'utf-8')
    return JSON5.parse(targetContent).version ?? null
  } catch {
    return null
  }
}
