import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

appendFileSync(join(process.cwd(), 'lazy-rebuild-probe.log'), 'evaluated\n')

export const value = 'initial'
