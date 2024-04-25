import * as fs from 'fs'

function getLogFile() {
  const logFile = process.env.PERSISTENT_LOG_FILE
  if (!logFile) {
    throw new Error(
      'Expected `process.env.PERSISTENT_LOG_FILE` to be passed' +
        '\n' +
        JSON.stringify(process.env, null, 2)
    )
  }
  return logFile
}

export function persistentLog(
  /** @type {Record<string, any>} */ data,
  file = getLogFile()
) {
  console.log(data)
  fs.appendFileSync(file, JSON.stringify(data) + '\n')
}

export function clearPersistentLog(file = getLogFile()) {
  if (fs.existsSync(file)) {
    fs.rmSync(file)
  }
}

export function readPersistentLog(file = getLogFile()) {
  if (!fs.existsSync(file)) {
    return []
  }
  const contents = fs.readFileSync(file, 'utf-8')
  return contents
    .split('\n')
    .slice(0, -1)
    .map((line) => JSON.parse(line))
}

export function cliLog(/** @type {Record<string, any>} */ data) {
  console.log('<test-log>' + JSON.stringify(data) + '</test-log>')
}

export function readCliLogs(/** @type {string} */ output) {
  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/^<test-log>(?<value>.+?)<\/test-log>$/)
      if (!match) {
        return null
      }
      return JSON.parse(match.groups.value)
    })
    .filter(Boolean)
}
