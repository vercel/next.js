import * as fs from 'fs'

export function persistentLog(data: Record<string, any>) {
  fs.appendFileSync('after-output.jsonl', JSON.stringify(data) + '\n')
}
