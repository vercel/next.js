import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tools = dirname(dirname(fileURLToPath(import.meta.url)))
const realFetch = globalThis.fetch
const { target } = JSON.parse(
  readFileSync(join(tools, 'security/assessment.json'), 'utf8')
)

globalThis.fetch = async (input, init) => {
  const url = String(input)

  if (url.startsWith('https://api.github.com/advisories?')) {
    return Response.json([])
  }

  if (url !== 'https://registry.npmjs.org/next/latest') {
    return realFetch(input, init)
  }

  const value = {
    version: target,
    engines: { node: '>=20.9.0' },
  }
  appendFileSync(
    join(tools, 'assessment.jsonl'),
    JSON.stringify({ url, value }) + '\n'
  )
  return Response.json(value)
}
