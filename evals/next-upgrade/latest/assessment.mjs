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
  let versions

  if (url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk') {
    versions = JSON.parse(init.body).next
    if (
      !Array.isArray(versions) ||
      versions.length === 0 ||
      versions.some((version) => typeof version !== 'string')
    ) {
      throw new Error('Expected Next.js advisory versions')
    }
    value = {}
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
    JSON.stringify({ url, versions, value }) + '\n'
  )
  return Response.json(value)
}
