import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tools = dirname(dirname(fileURLToPath(import.meta.url)))
const realFetch = globalThis.fetch
const { range, versions } = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'assessment.json'),
    'utf8'
  )
)

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
        versions.map((version) => [version, { version }])
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
