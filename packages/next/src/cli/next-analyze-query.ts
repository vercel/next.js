#!/usr/bin/env node

import * as path from 'node:path'
import { AnalyzeQueryError, queryAnalyzeData } from '../build/analyze/query'

export type NextAnalyzeQueryOptions = {
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
