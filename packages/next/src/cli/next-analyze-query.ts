#!/usr/bin/env node

import * as path from 'node:path'
import {
  AnalyzeQueryError,
  listAnalyzeQueries,
  queryAnalyzeData,
} from '../build/analyze/query'

export type NextAnalyzeQueryOptions = {
  help?: boolean
  input?: string
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
    return queryAnalyzeData(
      analyzeDir(directory),
      tool,
      input as Record<string, unknown>
    )
  })
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

    process.stdout.write(
      `${commandHelp.trimEnd()}\n\nQuery: ${query.name}\n\n  ${query.description}\n\n  Input schema:\n${indentJson(query.inputSchema, 4)}\n\n  Example input:\n${indentJson(query.example, 4)}\n`
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
