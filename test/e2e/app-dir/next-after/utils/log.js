import * as fs from 'fs'
import * as path from 'path'

const LOG_FILE =
  process.env.PERSISTENT_LOG_FILE ??
  path.resolve(process.cwd(), 'after-output.jsonl')

export function persistentLog(
  /** @type {Record<string, any>} */ data,
  file = LOG_FILE
) {
  console.log(data)
  fs.appendFileSync(file, JSON.stringify(data) + '\n')
}

export function clearPersistentLog(file = LOG_FILE) {
  if (fs.existsSync(file)) {
    fs.rmSync(file)
  }
}

export function readPersistentLog(file = LOG_FILE) {
  const contents = fs.readFileSync(file, 'utf-8')
  return contents
    .split('\n')
    .slice(0, -1)
    .map((line) => JSON.parse(line))
}
