import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function readTree(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory()
      ? readTree(path)
      : [[path, readFileSync(path, 'utf8')]]
  })
}

const sources = readTree('/app/app')
const source = sources.map(([, contents]) => contents).join('\n')
const clientSources = sources
  .filter(([, contents]) => /^\s*['"]use client['"]/m.test(contents))
  .map(([, contents]) => contents)
  .join('\n')

const sensitiveSources = sources.filter(([, contents]) =>
  /node:crypto|TEAM_SIGNING_SECRET/.test(contents)
)

if (sensitiveSources.length === 0) {
  throw new Error('The server-side signing behavior must be preserved.')
}

for (const [path, contents] of sensitiveSources) {
  if (!/import\s+['"]server-only['"]/.test(contents)) {
    throw new Error(
      `Signing code in ${path} must keep an explicit server-only boundary.`
    )
  }
}

const forbiddenClientPatterns = [
  [/server-only/, 'A Client Component still imports server-only code.'],
  [/node:crypto/, 'Node.js crypto must not enter a Client Component.'],
  [
    /TEAM_SIGNING_SECRET/,
    'The signing secret must not enter a Client Component.',
  ],
  [
    /process\.env/,
    'Server environment access must not enter a Client Component.',
  ],
]

for (const [pattern, message] of forbiddenClientPatterns) {
  if (pattern.test(clientSources)) {
    throw new Error(message)
  }
}

if (/NEXT_PUBLIC_[A-Z0-9_]*SECRET/.test(source)) {
  throw new Error('Do not expose the signing secret through NEXT_PUBLIC.')
}
