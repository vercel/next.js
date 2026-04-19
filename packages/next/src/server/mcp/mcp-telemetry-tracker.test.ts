/**
 * @jest-environment node
 */

import { mcpTelemetryTracker } from './mcp-telemetry-tracker'

describe('MCP Telemetry Tracker', () => {
  beforeEach(() => {
    // Reset tracker state before each test
    mcpTelemetryTracker.reset()
  })

  afterAll(() => {
    // Clean up after all tests
    mcpTelemetryTracker.reset()
  })

  it('should start with no usage', () => {
    expect(mcpTelemetryTracker.hasUsage()).toBe(false)
    expect(mcpTelemetryTracker.getUsages()).toEqual([])
  })

  it('should track single tool call', () => {
    mcpTelemetryTracker.recordToolCall('mcp/get_errors')

    expect(mcpTelemetryTracker.hasUsage()).toBe(true)
    expect(mcpTelemetryTracker.getUsages()).toEqual([
      {
        featureName: 'mcp/get_errors',
        invocationCount: 1,
      },
    ])
  })

  it('should increment invocation count for repeated calls', () => {
    mcpTelemetryTracker.recordToolCall('mcp/get_errors')
    mcpTelemetryTracker.recordToolCall('mcp/get_errors')
    mcpTelemetryTracker.recordToolCall('mcp/get_errors')

    const usages = mcpTelemetryTracker.getUsages()
    expect(usages).toHaveLength(1)
    expect(usages[0]).toEqual({
      featureName: 'mcp/get_errors',
      invocationCount: 3,
    })
  })

  it('should track multiple different tools', () => {
    mcpTelemetryTracker.recordToolCall('mcp/get_errors')
    mcpTelemetryTracker.recordToolCall('mcp/get_logs')
    mcpTelemetryTracker.recordToolCall('mcp/get_page_metadata')
    mcpTelemetryTracker.recordToolCall('mcp/get_errors') // Duplicate

    const usages = mcpTelemetryTracker.getUsages()
    expect(usages).toHaveLength(3)

    // Find each tool in the results
    const errorsUsage = usages.find((u) => u.featureName === 'mcp/get_errors')
    const logsUsage = usages.find((u) => u.featureName === 'mcp/get_logs')
    const pageMetadataUsage = usages.find(
      (u) => u.featureName === 'mcp/get_page_metadata'
    )

    expect(errorsUsage).toEqual({
      featureName: 'mcp/get_errors',
      invocationCount: 2,
    })
    expect(logsUsage).toEqual({
      featureName: 'mcp/get_logs',
      invocationCount: 1,
    })
    expect(pageMetadataUsage).toEqual({
      featureName: 'mcp/get_page_metadata',
      invocationCount: 1,
    })
  })

  it('should track all 5 MCP tools', () => {
    mcpTelemetryTracker.recordToolCall('mcp/get_errors')
    mcpTelemetryTracker.recordToolCall('mcp/get_logs')
    mcpTelemetryTracker.recordToolCall('mcp/get_page_metadata')
    mcpTelemetryTracker.recordToolCall('mcp/get_project_metadata')
    mcpTelemetryTracker.recordToolCall('mcp/get_server_action_by_id')

    const usages = mcpTelemetryTracker.getUsages()
    expect(usages).toHaveLength(5)

    const toolNames = usages.map((u) => u.featureName)
    expect(toolNames).toContain('mcp/get_errors')
    expect(toolNames).toContain('mcp/get_logs')
    expect(toolNames).toContain('mcp/get_page_metadata')
    expect(toolNames).toContain('mcp/get_project_metadata')
    expect(toolNames).toContain('mcp/get_server_action_by_id')
  })

  it('should reset tracking', () => {
    mcpTelemetryTracker.recordToolCall('mcp/get_errors')
    mcpTelemetryTracker.recordToolCall('mcp/get_logs')

    expect(mcpTelemetryTracker.hasUsage()).toBe(true)
    expect(mcpTelemetryTracker.getUsages()).toHaveLength(2)

    mcpTelemetryTracker.reset()

    expect(mcpTelemetryTracker.hasUsage()).toBe(false)
    expect(mcpTelemetryTracker.getUsages()).toEqual([])
  })

  it('should maintain accurate counts across multiple operations', () => {
    // Simulate realistic usage pattern
    mcpTelemetryTracker.recordToolCall('mcp/get_project_metadata') // 1
    mcpTelemetryTracker.recordToolCall('mcp/get_page_metadata') // 1
    mcpTelemetryTracker.recordToolCall('mcp/get_errors') // 1
    mcpTelemetryTracker.recordToolCall('mcp/get_errors') // 2
    mcpTelemetryTracker.recordToolCall('mcp/get_page_metadata') // 2
    mcpTelemetryTracker.recordToolCall('mcp/get_errors') // 3
    mcpTelemetryTracker.recordToolCall('mcp/get_logs') // 1

    const usages = mcpTelemetryTracker.getUsages()
    expect(usages).toHaveLength(4)

    const counts = new Map(
      usages.map((u) => [u.featureName, u.invocationCount])
    )

    expect(counts.get('mcp/get_errors')).toBe(3)
    expect(counts.get('mcp/get_page_metadata')).toBe(2)
    expect(counts.get('mcp/get_project_metadata')).toBe(1)
    expect(counts.get('mcp/get_logs')).toBe(1)
  })
})
