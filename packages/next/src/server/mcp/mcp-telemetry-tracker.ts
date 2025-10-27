/**
 * Telemetry tracker for MCP tool call usage.
 * Tracks invocation counts for each MCP tool to be reported via telemetry.
 */

import type { McpToolName } from '../../telemetry/events/build'

export interface McpToolUsage {
  featureName: McpToolName
  invocationCount: number
}

class McpTelemetryTracker {
  private usageMap = new Map<McpToolName, number>()

  /**
   * Record a tool call invocation
   */
  recordToolCall(toolName: McpToolName): void {
    const current = this.usageMap.get(toolName) || 0
    this.usageMap.set(toolName, current + 1)
  }

  /**
   * Get all tool usages as an array
   */
  getUsages(): McpToolUsage[] {
    return Array.from(this.usageMap.entries()).map(([featureName, count]) => ({
      featureName,
      invocationCount: count,
    }))
  }

  /**
   * Reset all usage tracking
   */
  reset(): void {
    this.usageMap.clear()
  }

  /**
   * Check if any tools have been called
   */
  hasUsage(): boolean {
    return this.usageMap.size > 0
  }
}

// Singleton instance
export const mcpTelemetryTracker = new McpTelemetryTracker()

/**
 * Get MCP tool usage telemetry
 */
export function getMcpTelemetryUsage(): McpToolUsage[] {
  return mcpTelemetryTracker.getUsages()
}

/**
 * Reset MCP telemetry tracker
 */
export function resetMcpTelemetry(): void {
  mcpTelemetryTracker.reset()
}

/**
 * Record MCP telemetry usage to the telemetry instance
 */
export function recordMcpTelemetry(telemetry: {
  record: (event: any) => void
}): void {
  const mcpUsages = getMcpTelemetryUsage()
  if (mcpUsages.length === 0) {
    return
  }

  const { eventMcpToolUsage } =
    require('../../telemetry/events/build') as typeof import('../../telemetry/events/build')
  const events = eventMcpToolUsage(mcpUsages)
  for (const event of events) {
    telemetry.record(event)
  }
}
