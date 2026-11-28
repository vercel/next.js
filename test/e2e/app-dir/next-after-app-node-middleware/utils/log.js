export function cliLog(/** @type {string | Record<string, any>} */ data) {
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
