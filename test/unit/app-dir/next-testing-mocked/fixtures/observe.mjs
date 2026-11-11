import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function observe(name, raw) {
  writeFileSync(
    join(process.env.DEFINE_HELPER_EVIDENCE, name + '.json'),
    JSON.stringify(raw, null, 2) + '\n',
    { flag: 'wx' }
  )
  console.log('DEFINE_HELPER_RAW ' + JSON.stringify({ name, raw }))
}
