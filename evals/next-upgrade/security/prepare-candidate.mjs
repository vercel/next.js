import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tools = dirname(dirname(fileURLToPath(import.meta.url)))
const next = join(tools, 'next/node_modules/next')
const manifestPath = join(next, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const candidateVersion = manifest.version
const installedVersion = process.argv[2]

if (!installedVersion) throw new Error('Provide the simulated stable version')

const textExtensions = new Set(['', '.cjs', '.js', '.json', '.mjs'])
let replacements = 0

function replaceVersion(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stats = statSync(path)

    if (stats.isDirectory()) {
      replaceVersion(path)
      continue
    }

    if (!textExtensions.has(extname(path))) continue

    const source = readFileSync(path, 'utf8')
    if (!source.includes(candidateVersion)) continue

    replacements += source.split(candidateVersion).length - 1
    writeFileSync(path, source.replaceAll(candidateVersion, installedVersion))
  }
}

replaceVersion(join(next, 'dist'))

if (replacements === 0) {
  throw new Error(`Could not find candidate version ${candidateVersion}`)
}

manifest.version = installedVersion
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
