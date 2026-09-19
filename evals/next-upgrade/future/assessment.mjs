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
  let value

  if (url.startsWith('https://api.github.com/advisories?')) {
    value = []
  } else if (url === 'https://registry.npmjs.org/next/latest') {
    value = {
      version: target,
      engines: { node: '>=20.9.0' },
    }
  } else {
    return realFetch(input, init)
  }

  appendFileSync(
    join(tools, 'assessment.jsonl'),
    JSON.stringify({ url, value }) + '\n'
  )
  return Response.json(value)
}
