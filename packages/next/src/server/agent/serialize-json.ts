import type { AgentRoute } from './types'

export function serializeAgentDocumentToJson(
  document: AgentRoute.Document
): string {
  return `${JSON.stringify(document, null, 2)}\n`
}
