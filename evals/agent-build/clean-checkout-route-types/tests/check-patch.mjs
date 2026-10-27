// Rejects patches that commit generated output or dependencies. An empty
// patch is allowed here so the untouched fixture reaches the CI steps and
// fails there for the intended reason.
import { existsSync, readFileSync } from 'node:fs'

const patchPath = process.argv[2]
const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''

const addedPaths = [...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1])

const forbidden = [
  [/^\.next\//, 'Generated output under .next/ must not be committed.'],
  [/^node_modules\//, 'Dependencies must not be committed.'],
]

for (const path of addedPaths) {
  for (const [pattern, message] of forbidden) {
    if (pattern.test(path)) {
      throw new Error(`${message} (${path})`)
    }
  }
}
