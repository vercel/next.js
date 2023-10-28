import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { transformSync } from './swc'

// TODO: Cache on init, re-compile only if next.config.ts has changed
export function compileConfig(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8')
  const compiled = transformSync(content, {
    jsc: {
      target: 'es5',
      parser: {
        syntax: 'typescript',
      },
    },
  })

  const cwd = filePath.replace('/next.config.ts', '')
  mkdirSync(join(cwd, '.next'), { recursive: true })

  const compiledFilePath = join(cwd, '.next', 'next.config.mjs')
  writeFileSync(compiledFilePath, compiled.code)

  return compiledFilePath
}
