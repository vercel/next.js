#!/usr/bin/env node
/**
 * Aggregates results from sharded stats runs and posts combined comment
 *
 * Usage: node aggregate-results.js <results-dir>
 *
 * Expects JSON files named pr-stats-*.json in the results directory
 * 
 * FIX: Added directory existence check to prevent ENOENT error when
 * the stats-results directory doesn't exist. This can happen for:
 * - Docs-only changes where stats jobs are skipped
 * - First-time runs where directory hasn't been created yet
 * - Clean runner environments without existing artifacts
 */

const path = require('path')
const fs = require('fs/promises')
const { existsSync } = require('fs')
const addComment = require('./add-comment')
const logger = require('./util/logger')

async function main() {
  const resultsDir = process.argv[2] || process.cwd()

  logger(`Aggregating results from: ${resultsDir}`)

  // ========== FIX: Check if directory exists ==========
  // This prevents ENOENT error when stats-results directory doesn't exist
  // Common scenarios: docs-only changes, first-time runs, or when no stats jobs ran
  if (!existsSync(resultsDir)) {
    logger(`⚠️ Results directory does not exist: ${resultsDir}`)
    logger(`This typically happens for docs-only changes or when no stats jobs ran.`)
    logger(`Creating directory and exiting gracefully...`)
    
    // Create the directory to prevent future errors
    await fs.mkdir(resultsDir, { recursive: true })
    
    // Create an empty results file to indicate no stats were generated
    const emptyResultsPath = path.join(resultsDir, 'pr-stats-empty.json')
    await fs.writeFile(emptyResultsPath, JSON.stringify({
      results: [],
      actionInfo: { isRelease: false, skipStats: true },
      statsConfig: {},
      message: "No stats generated - likely a docs-only change"
    }, null, 2))
    
    logger(`✅ Created empty results file at ${emptyResultsPath}`)
    process.exit(0)
  }

  // Find all pr-stats-*.json files
  const files = await fs.readdir(resultsDir)
  const statsFiles = files.filter(
    (f) => f.startsWith('pr-stats-') && f.endsWith('.json')
  )

  if (statsFiles.length === 0) {
    // This can happen for docs-only changes where stats jobs are skipped
    logger('No pr-stats-*.json files found - this may be a docs-only change')
    
    // Create a placeholder to avoid future errors
    const placeholderPath = path.join(resultsDir, 'pr-stats-placeholder.json')
    await fs.writeFile(placeholderPath, JSON.stringify({
      results: [],
      actionInfo: { skipStats: true },
      statsConfig: {}
    }, null, 2))
    
    process.exit(0)
  }

  logger(`Found ${statsFiles.length} results files: ${statsFiles.join(', ')}`)

  // Load all results
  const allData = []
  for (const file of statsFiles) {
    const filePath = path.join(resultsDir, file)
    try {
      const content = await fs.readFile(filePath, 'utf8')
      const data = JSON.parse(content)
      allData.push(data)
      logger(`Loaded ${file} successfully`)
    } catch (err) {
      logger(`Warning: Failed to load ${file}: ${err.message}`)
    }
  }

  if (allData.length === 0) {
    logger('No valid results files could be loaded')
    process.exit(1)
  }

  // Use the first file's actionInfo and statsConfig
  const { actionInfo, statsConfig } = allData[0]

  // Re-inject the GitHub token from env (it's excluded from JSON serialization for security)
  actionInfo.githubToken = process.env.PR_STATS_COMMENT_TOKEN

  // Merge results from all files
  // Each file has results array with {title, mainRepoStats, diffRepoStats, diffs}
  // We need to merge stats objects by combining their keys
  const mergedResults = []

  // Assume all files have the same number of configs with same titles
  const numConfigs = allData[0].results.length

  for (let i = 0; i < numConfigs; i++) {
    const title = allData[0].results[i].title
    const mergedMainRepoStats = {}
    const mergedDiffRepoStats = {}
    let mergedDiffs = null

    for (const data of allData) {
      const result = data.results[i]

      // Merge mainRepoStats
      if (result.mainRepoStats) {
        for (const [key, value] of Object.entries(result.mainRepoStats)) {
          if (!mergedMainRepoStats[key]) {
            mergedMainRepoStats[key] = {}
          }
          Object.assign(mergedMainRepoStats[key], value)
        }
      }

      // Merge diffRepoStats
      if (result.diffRepoStats) {
        for (const [key, value] of Object.entries(result.diffRepoStats)) {
          if (!mergedDiffRepoStats[key]) {
            mergedDiffRepoStats[key] = {}
          }
          Object.assign(mergedDiffRepoStats[key], value)
        }
      }

      // Merge diffs (just combine all diff objects)
      if (result.diffs) {
        if (!mergedDiffs) {
          mergedDiffs = {}
        }
        Object.assign(mergedDiffs, result.diffs)
      }
    }

    mergedResults.push({
      title,
      mainRepoStats: mergedMainRepoStats,
      diffRepoStats: mergedDiffRepoStats,
      diffs: mergedDiffs,
    })
  }

  logger(
    `Merged ${allData.length} result sets into ${mergedResults.length} configs`
  )

  // Post the combined comment
  await addComment(mergedResults, actionInfo, statsConfig)

  logger('Aggregation complete')
}

main().catch((err) => {
  console.error('Error aggregating results:', err)
  process.exit(1)
})
