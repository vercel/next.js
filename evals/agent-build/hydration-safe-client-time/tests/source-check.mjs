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

const config = readFileSync('/app/next.config.ts', 'utf8')
const page = readFileSync('/app/app/activity/page.tsx', 'utf8')
const source = readTree('/app/app')
  .map(([, contents]) => contents)
  .join('\n')

if (!/cacheComponents\s*:\s*true/.test(config)) {
  throw new Error('Cache Components must remain enabled.')
}
if (!/export\s+const\s+instant\s*=\s*true/.test(page)) {
  throw new Error('The activity route must remain instant.')
}

const forbidden = [
  [/\bsuppressHydrationWarning\b/, 'Do not suppress the hydration warning.'],
  [/\bconnection\s*\(/, 'Do not move the route to request-time rendering.'],
  [/\bunstable_noStore\s*\(/, 'Do not opt the route out of prerendering.'],
  [/\bdynamic\s*=\s*['"]force-dynamic['"]/, 'Do not force dynamic rendering.'],
  [/\binstant\s*=\s*false\b/, 'Do not disable instant validation.'],
]

for (const [pattern, message] of forbidden) {
  if (pattern.test(source) || pattern.test(config)) {
    throw new Error(message)
  }
}
