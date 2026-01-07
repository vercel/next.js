import { promises as fs } from 'fs'
import findUp from 'next/dist/compiled/find-up'
import JSON5 from 'next/dist/compiled/json5'
import * as path from 'path'

type PackageJsonDependencies = {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

let cachedDeps: Promise<PackageJsonDependencies>

export function getDependencies({
  cwd,
}: {
  cwd: string
}): Promise<PackageJsonDependencies> {
  if (cachedDeps) {
    return cachedDeps
  }

  return (cachedDeps = (async () => {
    const configurationPath: string | undefined = await findUp('package.json', {
      cwd,
    })
    if (!configurationPath) {
      return { dependencies: {}, devDependencies: {} }
    }

    const content = await fs.readFile(configurationPath, 'utf-8')
    const packageJson: any = JSON5.parse(content)

    const { dependencies = {}, devDependencies = {} } = packageJson || {}
    return { dependencies, devDependencies }
  })())
}

export async function getPackageVersion({
  cwd,
  name,
}: {
  cwd: string
  name: string
}): Promise<string | null> {
  const { dependencies, devDependencies } = await getDependencies({ cwd })
  if (!(dependencies[name] || devDependencies[name])) {
    return null
  }

  const cwd2 =
    cwd.endsWith(path.posix.sep) || cwd.endsWith(path.win32.sep)
      ? cwd
      : `${cwd}/`

  try {
    const targetPath = require.resolve(`${name}/package.json`, {
      paths: [cwd2],
    })
    const targetContent = await fs.readFile(targetPath, 'utf-8')
    return JSON5.parse(targetContent).version ?? null
  } catch {
    return null
  }
}
