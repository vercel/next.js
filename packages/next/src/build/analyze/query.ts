import { AnalyzeRepository } from './repository'
import {
  AnalyzeQueryError,
  createAnalyzeQueryRegistry,
  type AnalyzeQueryListing,
} from './queries'

export { AnalyzeQueryError }

export function listAnalyzeQueries(analyzeDir: string): AnalyzeQueryListing[] {
  return createAnalyzeQueryRegistry(new AnalyzeRepository(analyzeDir)).list()
}

export function queryAnalyzeData(
  analyzeDir: string,
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  return createAnalyzeQueryRegistry(new AnalyzeRepository(analyzeDir)).execute(
    name,
    input
  )
}
