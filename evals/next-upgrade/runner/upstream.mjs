import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Freeze only upgrade metadata. App installation still uses the real registry.
const tools = dirname(fileURLToPath(import.meta.url))
const scenario = JSON.parse(readFileSync(join(tools, 'upstream.json'), 'utf8'))
const realFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : String(input.url ?? input)
  let value
  if (url.startsWith('https://api.github.com/advisories?')) {
    value = scenario.range
      ? [
          {
            ghsa_id: 'GHSA-upgrade-eval-fixture',
            html_url: 'https://github.com/advisories/GHSA-upgrade-eval-fixture',
            severity: scenario.severity,
            withdrawn_at: null,
            vulnerabilities: [
              {
                package: { ecosystem: 'npm', name: 'next' },
                vulnerable_version_range: scenario.range,
              },
            ],
          },
        ]
      : []
  } else if (url === 'https://registry.npmjs.org/next') {
    value = {
      versions: Object.fromEntries(
        scenario.versions.map((version) => [version, { version }])
      ),
    }
  } else if (
    url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
  ) {
    value = scenario.range
      ? { next: [{ vulnerable_versions: scenario.range }] }
      : {}
  } else if (url === 'https://registry.npmjs.org/next/latest') {
    value = { version: scenario.target, engines: { node: '>=20.9.0' } }
  } else {
    return realFetch(input, init)
  }
  appendFileSync(
    join(tools, 'upstream.jsonl'),
    JSON.stringify({ url, value }) + '\n'
  )
  return Response.json(value)
}
