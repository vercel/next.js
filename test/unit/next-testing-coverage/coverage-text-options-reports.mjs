import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyCoverageText } from './text-reporter-fixture.mjs'

const profiles = JSON.parse(
  fs.readFileSync(
    fileURLToPath(
      new URL('./fixtures/coverage-text-options.expected.json', import.meta.url)
    )
  )
).rows
const profile = profiles.find((value) => value.name === process.argv[4])
assert(profile, 'Unknown coverage text profile')
await verifyCoverageText(profile)
