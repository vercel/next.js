import Ajv2020 from 'ajv/dist/2020'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const schema = JSON.parse(
  readFileSync(
    join(__dirname, '../../packages/next/analyze/graph-v1.schema.json'),
    'utf8'
  )
)
export const isValidGraphRecord = new Ajv2020({ allErrors: true }).compile(
  schema
)

// JSON Schema describes a single line. Check stream framing and joins separately.
export function validateGraphDump(output: string): void {
  if (!output.endsWith('\n')) throw new Error('Truncated analyzer graph stream')
  const records = output
    .slice(0, -1)
    .split('\n')
    .map((line) => JSON.parse(line))
  if (records[0]?.type !== 'meta')
    throw new Error('Analyzer graph stream must start with meta')

  const routes = new Set<string>()
  const outputs = new Set<string>()
  let routeRecords = 0
  for (const [index, parsed] of records.entries()) {
    if (!isValidGraphRecord(parsed)) {
      throw new Error(
        `Invalid analyzer graph record ${index}: ${JSON.stringify(isValidGraphRecord.errors)}`
      )
    }
    const record = parsed as {
      type: string
      route: string
      filename: string
      outputs: string[]
    }
    if (record.type === 'meta') {
      if (index !== 0) throw new Error('Duplicate analyzer graph meta')
    } else if (record.type === 'module') {
      if (routeRecords) throw new Error('Module record after route records')
    } else {
      const key = record.route
      if (record.type === 'route') {
        if (routes.has(key)) throw new Error(`Duplicate analyzer route: ${key}`)
        routes.add(key)
        routeRecords++
      } else if (!routes.has(key)) {
        throw new Error(`Unknown route for graph record ${index}`)
      }
      if (record.type === 'output') {
        const outputKey = JSON.stringify([key, record.filename])
        if (outputs.has(outputKey)) {
          throw new Error(`Duplicate analyzer output: ${record.filename}`)
        }
        outputs.add(outputKey)
      } else if (
        record.type === 'part' &&
        !outputs.has(JSON.stringify([key, record.filename]))
      ) {
        throw new Error(`Unknown output for graph record ${index}`)
      } else if (record.type === 'group') {
        for (const filename of record.outputs) {
          if (!outputs.has(JSON.stringify([key, filename]))) {
            throw new Error(`Unknown group output for graph record ${index}`)
          }
        }
      }
    }
  }
  if (routeRecords !== records[0].selected_routes) {
    throw new Error('Incomplete analyzer route records')
  }
  if (routeRecords > records[0].route_count) {
    throw new Error('Invalid analyzer route count')
  }
}
