import * as fs from 'fs'

export function persistentLog(/** @type {Record<string, any>} */ data) {
  console.log(data)
  fs.appendFileSync('after-output.jsonl', JSON.stringify(data) + '\n')
}
