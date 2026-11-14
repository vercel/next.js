const fs = require('fs')
const path = require('path')

export function readChunkModules(values, maxChunkSize) {
  // Derive markers from runtime exports rather than repeating the strings in the
  // assertions' source (which would put them in another emitted chunk).
  const markers = Object.entries(values).map(([name, value]) => [
    name,
    value.slice(0, 40),
  ])
  expect(new Set(markers.map(([, marker]) => marker)).size).toBe(markers.length)

  const output = path.join(process.cwd(), 'output')
  const chunks = fs
    .readdirSync(output, { recursive: true })
    .filter((name) => name.endsWith('.js'))
    .map((name) => {
      const code = fs.readFileSync(path.join(output, name), 'utf8')
      return {
        name,
        modules: markers
          .filter(([, marker]) => code.includes(marker))
          .map(([name]) => name)
          .sort(),
        size: Buffer.byteLength(code),
      }
    })
    .filter((chunk) => chunk.modules.length > 0)
    .sort((a, b) => a.modules[0].localeCompare(b.modules[0]))

  // Different async groups may emit the same module, but no payload may be
  // missing. Ignore runtime, test and helper chunks with no payload markers.
  expect([...new Set(chunks.flatMap((chunk) => chunk.modules))].sort()).toEqual(
    Object.keys(values).sort()
  )
  for (const chunk of chunks) {
    // The limit estimates inner module code, not file bytes. Allow framing for
    // module identifiers, factory wrappers and the source-map comment. Strict
    // membership assertions in each test also guard against oversized groups.
    expect(chunk.size).toBeLessThanOrEqual(maxChunkSize + 1024)
  }
  return chunks
}
