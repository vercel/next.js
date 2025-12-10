/**
 * Insights Storage Module
 *
 * Handles persistence of insights to NDJSON files during `next start`.
 * NDJSON (Newline Delimited JSON) is used because:
 * - Append-only (efficient for streaming writes)
 * - Stream-friendly (can be read line by line)
 * - Works well in Node.js
 * - Easily parsed for report generation
 */

import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import {
  INSIGHTS_DIRECTORY,
  INSIGHTS_FILE_PREFIX,
} from '../../shared/lib/constants'
import type { Insight } from './insights-types'

/**
 * Generate a session ID based on current timestamp
 * Format: YYYY-MM-DDTHH-MM-SS (filesystem-safe ISO format)
 */
export function generateSessionId(): string {
  const now = new Date()
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/**
 * Get the insights directory path within the dist directory
 */
export function getInsightsDirectory(distDir: string): string {
  return path.join(distDir, INSIGHTS_DIRECTORY)
}

/**
 * Get the full path to an insights NDJSON file
 */
export function getInsightsFilePath(
  distDir: string,
  sessionId: string
): string {
  return path.join(
    getInsightsDirectory(distDir),
    `${INSIGHTS_FILE_PREFIX}${sessionId}.ndjson`
  )
}

/**
 * Ensure the insights directory exists
 */
export async function ensureInsightsDirectory(distDir: string): Promise<void> {
  const insightsDir = getInsightsDirectory(distDir)
  try {
    await fsPromises.mkdir(insightsDir, { recursive: true })
  } catch (error: any) {
    // Ignore if directory already exists
    if (error.code !== 'EEXIST') {
      throw error
    }
  }
}

/**
 * Synchronously ensure the insights directory exists
 */
export function ensureInsightsDirectorySync(distDir: string): void {
  const insightsDir = getInsightsDirectory(distDir)
  try {
    fs.mkdirSync(insightsDir, { recursive: true })
  } catch (error: any) {
    // Ignore if directory already exists
    if (error.code !== 'EEXIST') {
      throw error
    }
  }
}

/**
 * Append a single insight to an NDJSON file
 * Creates the file if it doesn't exist
 */
export async function appendInsight(
  distDir: string,
  sessionId: string,
  insight: Insight
): Promise<void> {
  await ensureInsightsDirectory(distDir)
  const filePath = getInsightsFilePath(distDir, sessionId)

  // Append as a single line of JSON followed by newline
  const line = JSON.stringify(insight) + '\n'

  await fsPromises.appendFile(filePath, line, 'utf-8')
}

/**
 * Append multiple insights to an NDJSON file
 */
export async function appendInsights(
  distDir: string,
  sessionId: string,
  insights: Insight[]
): Promise<void> {
  if (insights.length === 0) return

  await ensureInsightsDirectory(distDir)
  const filePath = getInsightsFilePath(distDir, sessionId)

  // Build all lines and write at once for efficiency
  const lines = insights.map((insight) => JSON.stringify(insight)).join('\n')

  await fsPromises.appendFile(filePath, lines + '\n', 'utf-8')
}

/**
 * Read all insights from an NDJSON file
 */
export async function readInsightsFile(filePath: string): Promise<Insight[]> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)

    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as Insight
        } catch {
          // Skip malformed lines
          return null
        }
      })
      .filter((insight): insight is Insight => insight !== null)
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/**
 * List all insights files in the insights directory
 * Returns files sorted by modification time (newest first)
 */
export async function listInsightsFiles(distDir: string): Promise<string[]> {
  const insightsDir = getInsightsDirectory(distDir)

  try {
    const files = await fsPromises.readdir(insightsDir)
    const ndjsonFiles = files.filter(
      (file) =>
        file.startsWith(INSIGHTS_FILE_PREFIX) && file.endsWith('.ndjson')
    )

    // Get file stats and sort by modification time
    const filesWithStats = await Promise.all(
      ndjsonFiles.map(async (file) => {
        const fullPath = path.join(insightsDir, file)
        const stats = await fsPromises.stat(fullPath)
        return { file: fullPath, mtime: stats.mtime.getTime() }
      })
    )

    // Sort by modification time (newest first)
    filesWithStats.sort((a, b) => b.mtime - a.mtime)

    return filesWithStats.map((f) => f.file)
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/**
 * Get the most recent insights file
 */
export async function getLatestInsightsFile(
  distDir: string
): Promise<string | null> {
  const files = await listInsightsFiles(distDir)
  return files.length > 0 ? files[0] : null
}

/**
 * Read insights from all files (or just the latest)
 */
export async function readAllInsights(
  distDir: string,
  options: { latestOnly?: boolean } = {}
): Promise<Insight[]> {
  const files = await listInsightsFiles(distDir)

  if (files.length === 0) {
    return []
  }

  const filesToRead = options.latestOnly ? [files[0]] : files
  const allInsights: Insight[] = []

  for (const file of filesToRead) {
    const insights = await readInsightsFile(file)
    allInsights.push(...insights)
  }

  return allInsights
}

/**
 * Deduplicate insights by ID, keeping the most recent
 */
export function deduplicateInsights(insights: Insight[]): Insight[] {
  const byId = new Map<string, Insight>()

  for (const insight of insights) {
    const existing = byId.get(insight.id)
    if (
      !existing ||
      new Date(insight.timestamp) > new Date(existing.timestamp)
    ) {
      byId.set(insight.id, insight)
    }
  }

  return Array.from(byId.values())
}
