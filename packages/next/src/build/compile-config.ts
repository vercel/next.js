import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { transformSync } from './swc'

export function compileConfig({
  configPath,
  cwd,
}: {
  configPath: string
  cwd: string
}): string {
  const content = readFileSync(configPath, 'utf-8')
  const compiledFilePath = join(cwd, '.next', 'next.config.mjs')

  const compiled = transformSync(content, {
    jsc: {
      target: 'esnext',
      parser: {
        syntax: 'typescript',
      },
    },
    minify: true,
  })

  mkdirSync(join(cwd, '.next'), { recursive: true })
  writeFileSync(compiledFilePath, compiled.code)

  return compiledFilePath
}
