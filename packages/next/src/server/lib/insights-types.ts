/**
 * Type definitions for Next.js Insights system
 *
 * Simple structure: metadata + the terminal output as body
 */

/**
 * Types of insights that can be detected
 */
export type InsightType = 'waterfall'

/**
 * Severity levels for insights
 */
export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low'

/**
 * A single insight - simple structure with metadata + body
 */
export interface Insight {
  /** Unique identifier for deduplication */
  id: string

  /** Type of insight */
  type: InsightType

  /** Severity level */
  severity: InsightSeverity

  /** Affected route */
  route: string

  /** ISO timestamp when the insight was detected */
  timestamp: string

  /** The full terminal output - same as what's logged to console */
  body: string

  /** Debug info - raw data, thresholds, intermediate calculations */
  debug?: string
}
