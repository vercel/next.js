#!/usr/bin/env node

import * as path from 'node:path'
import { queryAnalyzeData } from '../build/analyze/query'

export type NextAnalyzeQueryOptions = {
  query?: string
  analyzeDir?: string
  input?: string
}

export async function nextAnalyzeQuery(
  tool: string,
  options: NextAnalyzeQueryOptions
): Promise<void> {
  try {
    const input: unknown = JSON.parse(options.input ?? '{}')
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error('--input must be a JSON object')
    }
    const analyzeDir = path.resolve(
      options.analyzeDir ?? '.next/diagnostics/analyze'
    )
    const result = await queryAnalyzeData(
      analyzeDir,
      tool,
      input as Record<string, unknown>
    )
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Analyzer query failed'
    process.stderr.write(`${JSON.stringify({ error: message })}\n`)
    process.exitCode = 1
  }
}
