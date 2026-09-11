#!/usr/bin/env node
// Read-only, deliberately simulated provider. No provider token or real remote.
const fs = require('node:fs')
const path = require('node:path')
const root = '/tmp/next-upgrade-tools'
const scenario = JSON.parse(
  fs.readFileSync(path.join(root, 'scenario.json'), 'utf8')
)
const command = process.argv[2]
fs.appendFileSync(
  path.join(root, 'provider-reads.jsonl'),
  JSON.stringify({
    command,
    args: process.argv.slice(3),
    at: new Date().toISOString(),
  }) + '\n'
)
const data = JSON.parse(
  fs.readFileSync(path.join(root, 'provider.json'), 'utf8')
)
if (command === 'repository') console.log(JSON.stringify(data.repository))
else if (command === 'list-open-prs') {
  if (scenario.id === 'lookup-blocked') {
    console.error(
      'SIMULATED_PROVIDER_UNAVAILABLE: restore fixture provider read access before attempting an upgrade.'
    )
    process.exitCode = 1
  } else {
    // Provider list endpoints return summaries; patches require a detail read.
    const items = data.prs.map(({ diff, ...summary }) => summary)
    console.log(JSON.stringify({ items, next: null }))
  }
} else if (
  command === 'inspect-pr' &&
  process.argv[3] === '41' &&
  data.prs.length
) {
  console.log(JSON.stringify(data.prs[0]))
} else {
  console.error(
    'Supported read operations: repository, list-open-prs, inspect-pr 41'
  )
  process.exitCode = 1
}
