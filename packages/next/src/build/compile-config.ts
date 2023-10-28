import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { transformSync } from './swc'

function checkCachedConfig(
  cachedConfigPath: string,
  configContent: string
): boolean {
  if (!existsSync(cachedConfigPath)) return false
  const cachedConfigContent = readFileSync(cachedConfigPath, 'utf-8')
  return cachedConfigContent === configContent
}

export function compileConfig({
  configPath,
  cwd,
}: {
  configPath: string
  cwd: string
}): string {
  const content = readFileSync(configPath, 'utf-8')
  const compiledFilePath = join(cwd, '.next', 'next.config.mjs')
  const cachedOriginalConfigPath = join(
    cwd,
    '.next',
    'cache',
    'config',
    'next-config-snapshot'
  )
  const hasIdenticalCachedConfig = checkCachedConfig(
    cachedOriginalConfigPath,
    content
  )

  if (hasIdenticalCachedConfig) {
    return compiledFilePath
  } else {
    mkdirSync(join(cwd, '.next', 'cache', 'config'), { recursive: true })
    writeFileSync(cachedOriginalConfigPath, content)
  }

  const compiled = transformSync(content, {
    jsc: {
      target: 'es5',
      parser: {
        syntax: 'typescript',
      },
    },
  })

  mkdirSync(join(cwd, '.next'), { recursive: true })
  writeFileSync(compiledFilePath, compiled.code)

  return compiledFilePath
}
