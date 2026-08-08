#!/usr/bin/env node
/**
 * Aggregates results from sharded stats runs and posts combined comment
 *
 * Usage: node aggregate-results.js <results-dir>
 *
 * Expects JSON files named pr-stats-*.json in the results directory
 */

const path = require('path')
const fs = require('fs/promises')
const { existsSync } = require('fs')
const addComment = require('./add-comment')
const logger = require('./util/logger')

const BUNDLER_DISPLAY_NAMES = {
  webpack: 'Webpack',
  turbopack: 'Turbopack',
}

function getBundlerDisplayName(bundler) {
  return (
    BUNDLER_DISPLAY_NAMES[bundler] ||
    bundler.charAt(0).toUpperCase() + bundler.slice(1)
  )
}

// The bundlers the `stats` matrix is expected to produce results for, provided
// by the workflow via STATS_EXPECTED_BUNDLERS. A bundler whose job failed, was
// cancelled, or timed out never uploads its pr-stats-<bundler>.json artifact, so
// comparing the expected set against the artifacts present tells us which
// bundlers are missing. Returns an empty list when unset (e.g. local runs), in
// which case we don't attempt to report missing bundlers.
function getExpectedBundlers() {
  const raw = process.env.STATS_EXPECTED_BUNDLERS
  if (!raw) return []
  return raw
    .split(/[\s,]+/)
    .map((b) => b.trim().toLowerCase())
    .filter(Boolean)
}

// Extract the bundler slug from a `pr-stats-<bundler>.json` filename.
function getBundlerFromStatsFile(file) {
  const match = file.match(/^pr-stats-(.+)\.json$/)
  return match ? match[1].toLowerCase() : null
}

async function main() {
  const resultsDir = process.argv[2] || process.cwd()

  logger(`Aggregating results from: ${resultsDir}`)

  // Find all pr-stats-*.json files
  const files = await fs.readdir(resultsDir)
  const statsFiles = files.filter(
    (f) => f.startsWith('pr-stats-') && f.endsWith('.json')
  )

  // Work out which bundlers are missing so we can report them in the comment.
  const expectedBundlers = getExpectedBundlers()
  const presentBundlers = statsFiles
    .map(getBundlerFromStatsFile)
    .filter(Boolean)
  const missingBundlers = expectedBundlers.filter(
    (bundler) => !presentBundlers.includes(bundler)
  )

  if (missingBundlers.length > 0) {
    logger(
      `Missing stats for bundler(s): ${missingBundlers.join(', ')} ` +
        `(their job failed, was cancelled, or timed out)`
    )
  }

  if (statsFiles.length === 0) {
    // The aggregate step only runs for non-docs changes (docs-only changes skip
    // it via the DOCS_CHANGE gate), so the absence of any artifact means no
    // bundler produced results. Only surface an "all bundlers failed" notice
    // when the stats jobs genuinely failed. A 'cancelled' result here means the
    // whole run was cancelled (superseded, or every bundler cancelled); we stay
    // silent so scripts/pr-ci-comment.mjs posts the cancelled notice instead of
    // a misleading failure comment for a run that never really ran.
    const statsResult = process.env.STATS_RESULT

    if (expectedBundlers.length === 0 || statsResult !== 'failure') {
      logger(
        `No pr-stats-*.json files found (stats result: ${statsResult || 'unknown'}) - nothing to aggregate`
      )
      process.exit(0)
    }

    logger(
      `No pr-stats-*.json files found - all bundler jobs ` +
        `(${expectedBundlers.join(', ')}) failed`
    )

    // No successful run means we don't have the actionInfo/statsConfig captured
    // inside a pr-stats file, so synthesize the minimum addComment needs to
    // render the "all bundlers failed" notice. In CI the rendered comment is
    // read from this job's logs and posted by scripts/pr-ci-comment.mjs; the
    // direct-post path in addComment is a no-op without a token/endpoint.
    await addComment(
      [],
      { isRelease: false, commitId: null },
      {},
      { missingBundlers: expectedBundlers.map(getBundlerDisplayName) }
    )
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
  await addComment(mergedResults, actionInfo, statsConfig, {
    missingBundlers: missingBundlers.map(getBundlerDisplayName),
  })

  logger('Aggregation complete')
}

main().catch((err) => {
  console.error('Error aggregating results:', err)
  process.exit(1)
})
