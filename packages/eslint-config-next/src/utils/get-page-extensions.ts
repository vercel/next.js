import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

const NEXT_CONFIG_FILES = [
  'next.config.js',
  'next.config.cjs',
  'next.config.mjs',
  'next.config.ts',
  'next.config.cts',
  'next.config.mts',
]

type NullableExtensions = string[] | undefined

const cache = new Map<string, NullableExtensions>()

export function getPageExtensionsFromConfig(cwd: string): NullableExtensions {
  if (cache.has(cwd)) {
    return cache.get(cwd)!
  }

  for (const file of NEXT_CONFIG_FILES) {
    const configPath = path.join(cwd, file)
    if (!fs.existsSync(configPath)) continue

    const result = readPageExtensions(configPath)
    if (result && result.length > 0) {
      const normalized = Array.from(
        new Set(
          result
            .filter((ext): ext is string => typeof ext === 'string')
            .map((ext) => ext.trim())
            .filter(Boolean)
            .map((ext) => ext.replace(/^\./, '').toLowerCase())
        )
      )

      if (normalized.length > 0) {
        cache.set(cwd, normalized)
        return normalized
      }
    }
  }

  cache.set(cwd, undefined)
  return undefined
}

function readPageExtensions(configPath: string): string[] | undefined {
  try {
    const evaluate = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        createEvalScript(configPath),
      ],
      {
        cwd: path.dirname(configPath),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      }
    )

    if (evaluate.status !== 0) {
      return undefined
    }

    const output = (evaluate.stdout || '').toString().trim()
    if (!output) {
      return undefined
    }

    try {
      return JSON.parse(output)
    } catch {
      return undefined
    }
  } catch {
    return undefined
  }
}

function createEvalScript(configPath: string) {
  return `
    import { pathToFileURL } from 'url';
    const CONFIG_PATH = pathToFileURL(${JSON.stringify(configPath)}).href;
    let config = await import(CONFIG_PATH);
    config = config && config.default ? config.default : config;
    if (typeof config === 'function') {
      try {
        const maybeConfig = await config('phase-production-build', {});
        if (maybeConfig) config = maybeConfig;
      } catch {}
    }
    if (config && Array.isArray(config.pageExtensions)) {
      const pageExtensions = config.pageExtensions;
      process.stdout.write(JSON.stringify(pageExtensions));
    }
  `
}
