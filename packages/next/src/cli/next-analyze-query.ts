#!/usr/bin/env node

import * as path from 'node:path'
import {
  AnalyzeQueryError,
  MAX_ALL_RESULTS,
  MAX_LIMIT,
  listAnalyzeQueries,
  queryAnalyzeData,
} from '../build/analyze/query'

export type NextAnalyzeQueryOptions = {
  help?: boolean
  input?: string
  all?: boolean
  fields?: string
}

function analyzeDir(directory?: string): string {
  return path.resolve(directory ?? '.', '.next/diagnostics/analyze')
}

async function printJson(run: () => Promise<unknown>): Promise<void> {
  try {
    process.stdout.write(`${JSON.stringify(await run())}\n`)
  } catch (error) {
    const output =
      error instanceof AnalyzeQueryError
        ? error.output
        : {
            error:
              error instanceof Error ? error.message : 'Analyzer query failed',
          }
    process.stderr.write(`${JSON.stringify(output)}\n`)
    process.exitCode = 1
  }
}

export async function nextAnalyzeQuery(
  tool: string,
  directory: string | undefined,
  options: NextAnalyzeQueryOptions
): Promise<void> {
  return printJson(async () => {
    const input: unknown = JSON.parse(options.input ?? '{}')
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error('--input must be a JSON object')
    }
    const analyzeDirectory = analyzeDir(directory)
    const listing = listAnalyzeQueries(analyzeDirectory).find(
      (query) => query.name === tool
    )
    if (!listing) {
      throw new AnalyzeQueryError({ error: `Unknown analyzer query: ${tool}` })
    }
    const fields = parseFields(options.fields, listing.selectableFields)
    const originalInput = input as Record<string, unknown>
    let output: unknown
    if (options.all) {
      if (!listing.collection) {
        throw new AnalyzeQueryError({
          error: `Query ${tool} does not return a paginated collection`,
        })
      }
      if (originalInput.offset !== undefined) {
        throw new AnalyzeQueryError({
          error: '--all cannot be combined with an explicit input offset',
        })
      }
      output = await queryAllPages(
        analyzeDirectory,
        tool,
        listing.collection,
        originalInput
      )
    } else {
      output = await queryAnalyzeData(analyzeDirectory, tool, originalInput)
    }
    return projectQueryFields(output, listing.collection, fields)
  })
}

function parseFields(
  value: string | undefined,
  available: string[] | undefined
): string[] | undefined {
  if (value === undefined) return undefined
  if (!available) {
    throw new AnalyzeQueryError({
      error: '--fields is only supported for paginated query results',
    })
  }
  const fields = value
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
  if (fields.length === 0) {
    throw new AnalyzeQueryError({
      error: '--fields requires at least one field',
    })
  }
  if (new Set(fields).size !== fields.length) {
    throw new AnalyzeQueryError({ error: '--fields contains duplicate fields' })
  }
  const unknown = fields.filter((field) => !available.includes(field))
  if (unknown.length) {
    throw new AnalyzeQueryError({
      error: `Unknown selectable fields: ${unknown.join(', ')}`,
      availableFields: available,
    })
  }
  return fields
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AnalyzeQueryError({ error: 'Invalid paginated query response' })
  }
  return value as Record<string, unknown>
}

async function queryAllPages(
  analyzeDirectory: string,
  tool: string,
  collection: string,
  input: Record<string, unknown>
): Promise<unknown> {
  return collectAllQueryPages(collection, (offset) =>
    queryAnalyzeData(analyzeDirectory, tool, {
      ...input,
      offset,
      limit: MAX_LIMIT,
    })
  )
}

export async function collectAllQueryPages(
  collection: string,
  queryPage: (offset: number) => Promise<unknown>
): Promise<unknown> {
  let offset = 0
  let first: Record<string, unknown> | undefined
  const values: unknown[] = []
  while (true) {
    const result = record(await queryPage(offset))
    const page = result[collection]
    const pagination = record(result.pagination)
    if (!Array.isArray(page)) {
      throw new AnalyzeQueryError({
        error: 'Invalid paginated query collection',
      })
    }
    const total = pagination.total
    const returned = pagination.returned
    if (
      typeof total !== 'number' ||
      typeof returned !== 'number' ||
      returned !== page.length ||
      pagination.offset !== offset
    ) {
      throw new AnalyzeQueryError({ error: 'Invalid pagination progress' })
    }
    if (total > MAX_ALL_RESULTS) {
      throw new AnalyzeQueryError({
        error: `--all result exceeds the ${MAX_ALL_RESULTS} row safety cap`,
        total,
        maxAllResults: MAX_ALL_RESULTS,
      })
    }
    first ??= result
    values.push(...page)
    if (pagination.truncated !== true) break
    if (returned === 0) {
      throw new AnalyzeQueryError({ error: 'Pagination made no progress' })
    }
    offset += returned
  }
  return {
    ...first,
    [collection]: values,
    pagination: {
      offset: 0,
      limit: values.length,
      total: values.length,
      returned: values.length,
      truncated: false,
    },
  }
}

export function projectQueryFields(
  output: unknown,
  collection: string | undefined,
  fields: string[] | undefined
): unknown {
  if (!fields || !collection) return output
  const result = record(output)
  const values = result[collection]
  if (!Array.isArray(values)) {
    throw new AnalyzeQueryError({
      error: 'Invalid selectable query collection',
    })
  }
  return {
    ...result,
    [collection]: values.map((value) => {
      const row = record(value)
      return Object.fromEntries(
        fields
          .filter((field) => field in row)
          .map((field) => [field, row[field]])
      )
    }),
  }
}

export function nextAnalyzeQueryHelp(
  commandHelp: string,
  name?: string,
  directory?: string
): void {
  const queries = listAnalyzeQueries(analyzeDir(directory))

  if (name) {
    const query = queries.find((item) => item.name === name)
    if (!query) {
      process.stderr.write(`Unknown analyzer query: ${name}\n`)
      process.exitCode = 1
      return
    }

    const caveats = query.caveats.map((caveat) => `    - ${caveat}`).join('\n')
    process.stdout.write(
      `${commandHelp.trimEnd()}\n\nQuery: ${query.name}\n\n  ${query.description}\n\n  Input schema:\n${indentJson(query.inputSchema, 4)}${query.selectableFields ? `\n\n  Selectable row fields (--fields):\n    ${query.selectableFields.join(', ')}` : ''}\n\n  Evidence caveats:\n${caveats}\n\n  Example input:\n${indentJson(query.example, 4)}\n`
    )
    return
  }

  const queryHelp = queries
    .map(
      (query) =>
        `  ${query.name}\n    ${query.description}\n    For input schema and example, run:\n      next experimental-analyze query ${query.name} --help`
    )
    .join('\n\n')
  process.stdout.write(
    `${commandHelp.trimEnd()}\n\nAvailable queries:\n\n${queryHelp}\n`
  )
}

function indentJson(value: unknown, spaces: number): string {
  const indentation = ' '.repeat(spaces)
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line) => `${indentation}${line}`)
    .join('\n')
}
