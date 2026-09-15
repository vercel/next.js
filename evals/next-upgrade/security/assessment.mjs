import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tools = dirname(dirname(fileURLToPath(import.meta.url)))
const realFetch = globalThis.fetch
const range = '>=15.0.0 <15.5.24'
const versions = ['15.5.23', '15.5.24', '16.0.0']

globalThis.fetch = async (input, init) => {
  const url = String(input)
  let value

  if (url.startsWith('https://api.github.com/advisories?')) {
    value = [
      {
        withdrawn_at: null,
        vulnerabilities: [
          {
            package: { ecosystem: 'npm', name: 'next' },
            vulnerable_version_range: range,
          },
        ],
      },
    ]
  } else if (url === 'https://registry.npmjs.org/next') {
    value = {
      versions: Object.fromEntries(
        versions.map((version) => [
          version,
          { version, engines: { node: '>=20.9.0' } },
        ])
      ),
    }
  } else if (
    url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
  ) {
    value = { next: [{ vulnerable_versions: range }] }
  } else {
    return realFetch(input, init)
  }

  appendFileSync(
    join(tools, 'assessment.jsonl'),
    JSON.stringify({ url, value }) + '\n'
  )
  return Response.json(value)
}
