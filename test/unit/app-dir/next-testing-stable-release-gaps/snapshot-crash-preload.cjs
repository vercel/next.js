// Fault injection is restricted to this acceptance run's owned snapshot path.
// The writer has completed its worker cleanup before this parent-side rename.
const fs = require('node:fs')
const promises = require('node:fs/promises')
const path = require('node:path')
const root = process.env.NEXT_TESTING_RELEASE_FAULT_ROOT
const original = promises.rename
if (root) {
  promises.rename = async function (from, to) {
    const value = await original.call(this, from, to)
    if (to === path.join(root, '__snapshots__', 'contract.case.mjs.snap')) {
      fs.writeFileSync(
        path.join(root, 'fault-observed.json'),
        JSON.stringify({ pid: process.pid, from, to })
      )
      process.kill(process.pid, 'SIGKILL')
    }
    return value
  }
}
