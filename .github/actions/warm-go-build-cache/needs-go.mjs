// @ts-check
// Prints `true` when the test group that `scripts/test-new-tests.mjs` runs
// for the given mode and group contains a suite with Go sources (a `go.mod`
// next to the test file), and `false` otherwise.
//
// Usage: node needs-go.mjs <dev|start> <current>/<total>
//
// The group assignment below must stay in sync with
// `scripts/test-new-tests.mjs`.
import fs from 'fs'
import path from 'path'
import getChangedTests from '../../../scripts/get-changed-tests.mjs'

const [mode, rawGroup] = process.argv.slice(2)
if (mode !== 'dev' && mode !== 'start') {
  throw new Error(`Invalid test mode: ${mode}. Must be one of: dev, start`)
}
const [currentGroup, groupTotal] = rawGroup.split('/').map(Number)

// get-changed-tests.mjs logs to stdout; keep stdout for the result.
const log = console.log
console.log = console.error
const { devTests, prodTests } = await getChangedTests()
console.log = log

/** @type {Array<string[]>} */
const fileGroups = []
for (const test of mode === 'dev' ? devTests : prodTests) {
  let smallestGroup = fileGroups[0]
  let smallestGroupIdx = 0
  for (let i = 0; i < groupTotal; i++) {
    if (!fileGroups[i]) {
      fileGroups[i] = []
    }
    if (
      smallestGroup &&
      fileGroups[i] &&
      fileGroups[i].length < smallestGroup.length
    ) {
      smallestGroup = fileGroups[i]
      smallestGroupIdx = i
    }
  }
  fileGroups[smallestGroupIdx].push(test)
}

const goTests = (fileGroups[currentGroup - 1] || []).filter((test) =>
  fs.existsSync(path.join(path.dirname(test), 'go.mod'))
)
console.error(`Tests with Go sources: ${JSON.stringify(goTests)}`)
console.log(goTests.length > 0)
