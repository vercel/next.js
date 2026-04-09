import child_process from 'node:child_process'
import fs, { readFileSync } from 'node:fs'

const unknown = Math.random()

child_process.spawnSync(unknown)
child_process.spawnSync('node', unknown)
child_process.spawnSync('node', [unknown, unknown])

require(unknown)

import(unknown)

fs.readFileSync(unknown)
readFileSync(unknown)

new URL(unknown, import.meta.url)
