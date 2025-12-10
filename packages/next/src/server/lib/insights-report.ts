/**
 * Insights Report Generation
 *
 * Aggregates insights from NDJSON files for the insights server.
 */

import type { Insight, InsightSeverity } from './insights-types'
import { deduplicateInsights } from './insights-storage'

/**
 * Summary statistics for a report
 */
export interface ReportSummary {
  total: number
  bySeverity: Record<InsightSeverity, number>
  byType: Record<string, number>
  byRoute: Record<string, number>
}

/**
 * Complete report data structure
 */
export interface ReportData {
  generatedAt: string
  nextVersion: string
  sessionCount: number
  insights: Insight[]
  summary: ReportSummary
}

/**
 * Aggregate insights and compute summary statistics
 */
export function aggregateInsights(insights: Insight[]): ReportData {
  const deduplicated = deduplicateInsights(insights)

  // Sort by severity (critical first) then by route
  const severityOrder: Record<InsightSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  deduplicated.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
    if (severityDiff !== 0) return severityDiff
    return a.route.localeCompare(b.route)
  })

  // Compute summary
  const summary: ReportSummary = {
    total: deduplicated.length,
    bySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    byType: {},
    byRoute: {},
  }

  for (const insight of deduplicated) {
    summary.bySeverity[insight.severity]++
    summary.byType[insight.type] = (summary.byType[insight.type] || 0) + 1
    summary.byRoute[insight.route] = (summary.byRoute[insight.route] || 0) + 1
  }

  return {
    generatedAt: new Date().toISOString(),
    nextVersion: process.env.__NEXT_VERSION || 'unknown',
    sessionCount: 1,
    insights: deduplicated,
    summary,
  }
}
