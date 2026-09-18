import { AnalyzeRepository } from './repository'
import { AnalyzeQueryError, createAnalyzeQueryRegistry } from './queries'

export { AnalyzeQueryError }

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
