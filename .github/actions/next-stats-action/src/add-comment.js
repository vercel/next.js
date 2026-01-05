const path = require('path')
const fs = require('fs').promises
const fetch = require('node-fetch')
const prettyMs = require('pretty-ms')
const logger = require('./util/logger')
const prettyBytes = require('pretty-bytes')
const { benchTitle } = require('./constants')

// Try to load Vercel KV - may not be available in all environments
let kv = null
async function getKV() {
  if (kv) return kv
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null
  }
  try {
    const { createClient } = require('@vercel/kv')
    kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
    return kv
  } catch (e) {
    logger.error('Failed to initialize Vercel KV:', e)
    return null
  }
}

const KV_STATS_KEY = 'next-stats-history'
const MAX_HISTORY_ENTRIES = 100

// ============================================================================
// Metric Configuration
// ============================================================================

// Human-readable labels for metrics
const METRIC_LABELS = {
  // Dev boot metrics - Turbopack (Listen = port listening, First Request = HTTP responding)
  nextDevColdListenDurationTurbo: 'Cold (Listen)',
  nextDevColdReadyDurationTurbo: 'Cold (First Request)',
  nextDevWarmListenDurationTurbo: 'Warm (Listen)',
  nextDevWarmReadyDurationTurbo: 'Warm (First Request)',
  // Dev boot metrics - Webpack
  nextDevColdListenDurationWebpack: 'Webpack Cold (Listen)',
  nextDevColdReadyDurationWebpack: 'Webpack Cold (First Request)',
  nextDevWarmListenDurationWebpack: 'Webpack Warm (Listen)',
  nextDevWarmReadyDurationWebpack: 'Webpack Warm (First Request)',
  // Production metrics
  nextStartReadyDuration: 'Prod Start',
  // Build metrics - Webpack
  buildDurationWebpack: 'Webpack Build Time',
  buildDurationCachedWebpack: 'Webpack Build Time (cached)',
  // Build metrics - Turbopack
  buildDurationTurbo: 'Turbo Build Time',
  buildDurationCachedTurbo: 'Turbo Build Time (cached)',
  // General metrics
  nodeModulesSize: 'node_modules Size',
}

// Group configuration for organizing the comment
const METRIC_GROUPS = {
  'Dev Server': {
    icon: '⚡',
    description:
      'Boot time for `next dev` (Turbopack). Cold = fresh build, Warm = with cache.',
    metrics: [
      {
        label: 'Cold (Listen)',
        key: 'nextDevColdListenDurationTurbo',
        description: 'Time until TCP port accepts connections',
      },
      {
        label: 'Cold (First Request)',
        key: 'nextDevColdReadyDurationTurbo',
        description: 'Time until first HTTP request succeeds',
      },
      {
        label: 'Warm (Listen)',
        key: 'nextDevWarmListenDurationTurbo',
        description: 'Time until TCP port accepts connections (cached)',
      },
      {
        label: 'Warm (First Request)',
        key: 'nextDevWarmReadyDurationTurbo',
        description: 'Time until first HTTP request succeeds (cached)',
      },
    ],
    webpackGroup: 'Dev Server (Webpack)',
  },
  'Dev Server (Webpack)': {
    icon: '📦',
    isLegacy: true,
    description:
      'Boot time for `next dev` (Webpack). Cold = fresh build, Warm = with cache.',
    metrics: [
      {
        label: 'Cold (Listen)',
        key: 'nextDevColdListenDurationWebpack',
        description: 'Time until TCP port accepts connections',
      },
      {
        label: 'Cold (First Request)',
        key: 'nextDevColdReadyDurationWebpack',
        description: 'Time until first HTTP request succeeds',
      },
      {
        label: 'Warm (Listen)',
        key: 'nextDevWarmListenDurationWebpack',
        description: 'Time until TCP port accepts connections (cached)',
      },
      {
        label: 'Warm (First Request)',
        key: 'nextDevWarmReadyDurationWebpack',
        description: 'Time until first HTTP request succeeds (cached)',
      },
    ],
  },
  'Production Builds': {
    icon: '⚡',
    description: 'Time for `next build` (Turbopack).',
    metrics: [
      {
        label: 'Fresh Build',
        key: 'buildDurationTurbo',
      },
      {
        label: 'Cached Build',
        key: 'buildDurationCachedTurbo',
      },
    ],
    webpackGroup: 'Production Builds (Webpack)',
  },
  'Production Builds (Webpack)': {
    icon: '📦',
    isLegacy: true,
    description: 'Time for `next build --webpack`.',
    metrics: [
      {
        label: 'Fresh Build',
        key: 'buildDurationWebpack',
      },
      {
        label: 'Cached Build',
        key: 'buildDurationCachedWebpack',
      },
      {
        label: 'node_modules Size',
        key: 'nodeModulesSize',
        type: 'bytes',
      },
    ],
  },
  'Production Runtime': {
    icon: '🚀',
    description: 'Boot time for `next start` (bundler-agnostic).',
    metrics: [
      {
        label: 'Start (First Request)',
        key: 'nextStartReadyDuration',
      },
    ],
  },
}

// ============================================================================
// Historical Data (Vercel KV)
// ============================================================================

async function loadHistory() {
  const kvClient = await getKV()
  if (!kvClient) {
    logger('KV not configured - historical trends unavailable')
    return { entries: [] }
  }

  try {
    const data = await kvClient.lrange(KV_STATS_KEY, -MAX_HISTORY_ENTRIES, -1)
    const entries = data.map((d) => (typeof d === 'string' ? JSON.parse(d) : d))
    logger(`Loaded ${entries.length} historical entries from KV`)
    return { entries }
  } catch (e) {
    logger.error('Failed to load history from KV:', e)
    return { entries: [] }
  }
}

async function saveToHistory(entry) {
  const kvClient = await getKV()
  if (!kvClient) return

  try {
    await kvClient.rpush(KV_STATS_KEY, JSON.stringify(entry))
    // Trim to keep only last N entries
    await kvClient.ltrim(KV_STATS_KEY, -MAX_HISTORY_ENTRIES, -1)
    logger('Saved stats to KV history')
  } catch (e) {
    logger.error('Failed to save to KV:', e)
  }
}

// ============================================================================
// Formatting Utilities
// ============================================================================

function prettifyTime(ms) {
  if (typeof ms !== 'number') return 'N/A'
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(3)}s`
}

const prettify = (val, type = 'bytes') => {
  if (typeof val !== 'number') return 'N/A'
  return type === 'bytes' ? prettyBytes(val) : prettifyTime(val)
}

const round = (num, places) => {
  const placesFactor = Math.pow(10, places)
  return Math.round(num * placesFactor) / placesFactor
}

const shortenLabel = (itemKey) =>
  itemKey.length > 24
    ? `${itemKey.slice(0, 12)}..${itemKey.slice(-12)}`
    : itemKey

function getMetricLabel(key) {
  return METRIC_LABELS[key] || shortenLabel(key)
}

function formatChange(mainVal, diffVal, type = 'bytes') {
  if (typeof mainVal !== 'number' || typeof diffVal !== 'number') {
    return { text: '-', significant: false, improved: false, regression: false }
  }

  const diff = diffVal - mainVal
  const percentChange = mainVal > 0 ? (diff / mainVal) * 100 : 0

  // Thresholds: filter CI noise while catching real regressions
  // For time: <50ms AND <10% = not worth mentioning (with 9 iterations for stable median)
  // For size: <1KB AND <1% = not worth mentioning
  // If mainVal is 0 and diff is non-zero, always consider it significant
  const isInsignificant =
    mainVal === 0 && diff !== 0
      ? false
      : type === 'ms'
        ? Math.abs(diff) < 50 && Math.abs(percentChange) < 10
        : Math.abs(diff) < 1024 && Math.abs(percentChange) < 1

  if (isInsignificant) {
    return { text: '✓', significant: false, improved: false, regression: false }
  }

  const improved = diff < 0
  const regression = diff > 0
  // Clear icons: 🔴 regression, 🟢 improvement
  const icon = improved ? '🟢' : '🔴'
  const sign = diff > 0 ? '+' : ''
  const formatted = prettify(Math.abs(diff), type)
  const pct = `(${percentChange > 0 ? '+' : ''}${Math.round(percentChange)}%)`

  return {
    text: `${icon} ${sign}${formatted} ${pct}`.trim(),
    significant: true,
    improved,
    regression,
  }
}

function generateTrendBar(values) {
  if (!values || values.length < 2) return ''

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  if (range === 0) return '▁▁▁▁▁' // All values the same

  // Unicode bar characters from short to tall
  const bars = '▁▂▃▄▅▆▇█'

  // Take last 5 values for a compact trend
  const recent = values.slice(-5)

  return recent
    .map((v) => {
      const normalized = (v - min) / range
      const index = Math.min(
        Math.floor(normalized * bars.length),
        bars.length - 1
      )
      return bars[index]
    })
    .join('')
}

function getHistoricalValues(history, metricKey, limit = 15) {
  if (!history?.entries?.length) return []
  return history.entries
    .slice(-limit)
    .map((e) => e.metrics?.[metricKey])
    .filter((v) => typeof v === 'number')
}

// ============================================================================
// Comment Generation
// ============================================================================

// Determine if a metric is time-based (ms) or size-based (bytes)
function getMetricType(metricKey) {
  if (metricKey.includes('Duration')) {
    return 'ms'
  }
  if (metricKey.includes('Size')) {
    return 'bytes'
  }
  return 'ms' // default to ms for performance metrics
}

function generateChangeSummary(mainStats, diffStats, history) {
  // Collect all significant changes across all metrics
  const changes = []

  // Check General metrics
  const mainGeneral = mainStats?.General || {}
  const diffGeneral = diffStats?.General || {}

  for (const key of Object.keys({ ...mainGeneral, ...diffGeneral })) {
    const mainVal = mainGeneral[key]
    const diffVal = diffGeneral[key]
    const type = getMetricType(key)
    const change = formatChange(mainVal, diffVal, type)

    if (change.significant) {
      const histValues = getHistoricalValues(history, key)
      changes.push({
        metric: getMetricLabel(key),
        mainVal: prettify(mainVal, type),
        diffVal: prettify(diffVal, type),
        change: change.text,
        trend: generateTrendBar(histValues),
        improved: change.improved,
        regression: change.regression,
      })
    }
  }

  if (changes.length === 0) {
    return `### ✅ No significant changes detected\n\n`
  }

  // Sort: regressions first, then improvements
  changes.sort((a, b) => {
    if (a.regression !== b.regression) return a.regression ? -1 : 1
    return 0
  })

  const regressions = changes.filter((c) => c.regression)
  const improvements = changes.filter((c) => c.improved)

  // Clear headline showing regressions
  let headline = ''
  if (regressions.length > 0) {
    headline = `### 🔴 ${regressions.length} regression${regressions.length > 1 ? 's' : ''}`
    if (improvements.length > 0) {
      headline += `, ${improvements.length} improvement${improvements.length > 1 ? 's' : ''}`
    }
  } else {
    headline = `### 🟢 ${improvements.length} improvement${improvements.length > 1 ? 's' : ''}`
  }

  const hasTrends = changes.some((c) => c.trend)
  let summary = `${headline}\n\n`

  if (hasTrends) {
    summary += `| Metric | Canary | PR | Change | Trend |\n`
    summary += `|:-------|-------:|---:|-------:|:-----:|\n`
    for (const c of changes) {
      summary += `| ${c.metric} | ${c.mainVal} | ${c.diffVal} | ${c.change} | ${c.trend} |\n`
    }
  } else {
    summary += `| Metric | Canary | PR | Change |\n`
    summary += `|:-------|-------:|---:|-------:|\n`
    for (const c of changes) {
      summary += `| ${c.metric} | ${c.mainVal} | ${c.diffVal} | ${c.change} |\n`
    }
  }

  return summary + '\n'
}

function generateGlossary() {
  return `<details>
<summary><strong>📖 Metrics Glossary</strong></summary>

**Dev Server Metrics:**
- **Listen** = TCP port starts accepting connections
- **First Request** = HTTP server returns successful response
- **Cold** = Fresh build (no cache)
- **Warm** = With cached build artifacts

**Build Metrics:**
- **Fresh** = Clean build (no .next directory)
- **Cached** = With existing .next directory

**Change Thresholds:**
- Time: Changes < 50ms AND < 10% are insignificant
- Size: Changes < 1KB AND < 1% are insignificant
- All other changes are flagged to catch regressions

</details>

`
}

function generateMetricsTable(
  groupName,
  config,
  mainGroup,
  diffGroup,
  history,
  isCollapsed = false
) {
  let rows = ''
  let hasAny = false

  for (const metricDef of config.metrics) {
    const mainVal = mainGroup[metricDef.key]
    const diffVal = diffGroup[metricDef.key]

    if (mainVal === undefined && diffVal === undefined) continue
    hasAny = true

    const metricType = metricDef.type || 'ms'
    const mainStr = prettify(mainVal, metricType)
    const diffStr = prettify(diffVal, metricType)
    const change = formatChange(mainVal, diffVal, metricType)
    const histValues = getHistoricalValues(history, metricDef.key)
    const sparkline = generateTrendBar(histValues)

    rows += `| ${metricDef.label} | ${mainStr} | ${diffStr} | ${change.text} | ${sparkline} |\n`
  }

  if (!hasAny) return ''

  const table = `### ${config.icon} ${groupName}

| Metric | Canary | PR | Change | Trend |
|:-------|-------:|---:|-------:|:-----:|
${rows}
`

  // Wrap legacy/webpack tables in collapsible details
  if (isCollapsed) {
    return `<details>
<summary><strong>${config.icon} ${groupName} (Legacy)</strong></summary>

${table}
</details>

`
  }

  return table
}

function generatePerformanceSection(mainStats, diffStats, history) {
  let content = ''

  content += generateGlossary()

  const mainGroup = mainStats?.General || {}
  const diffGroup = diffStats?.General || {}

  // Render groups in order: show Turbopack tables, then collapse Webpack tables
  for (const [groupName, config] of Object.entries(METRIC_GROUPS)) {
    // Skip legacy groups - they'll be rendered after their corresponding Turbopack group
    if (config.isLegacy) continue

    // Render Turbopack/main group prominently
    content += generateMetricsTable(
      groupName,
      config,
      mainGroup,
      diffGroup,
      history,
      false
    )

    // If this group has a corresponding Webpack group, render it collapsed
    if (config.webpackGroup) {
      const webpackConfig = METRIC_GROUPS[config.webpackGroup]
      if (webpackConfig) {
        content += generateMetricsTable(
          config.webpackGroup,
          webpackConfig,
          mainGroup,
          diffGroup,
          history,
          true // collapsed
        )
      }
    }
  }

  return content
}

// Base group names (without bundler suffix)
const BASE_BUNDLE_GROUPS = {
  client: [
    'Client Bundles (main, webpack)',
    'Client Pages',
    'Legacy Client Bundles (polyfills)',
  ],
  server: ['Next Runtimes', 'Edge SSR bundle Size', 'Middleware size'],
  other: ['Client Build Manifests', 'Rendered Page Sizes', 'build cache'],
}

// Bundler configuration
const BUNDLERS_CONFIG = [
  { name: 'Webpack', icon: '📦' },
  { name: 'Turbopack', icon: '⚡' },
]

// Helper to check if a group name belongs to a bundler category
function getBundlerFromGroupKey(groupKey) {
  for (const bundler of BUNDLERS_CONFIG) {
    if (groupKey.endsWith(`(${bundler.name})`)) {
      return bundler
    }
  }
  return null
}

// Helper to get the base group name (without bundler suffix)
function getBaseGroupName(groupKey) {
  return groupKey.replace(/ \((Webpack|Turbopack)\)$/, '')
}

function generateBundleGroup(groupKey, result, tableHead) {
  const gzipIgnoreRegex = new RegExp(`(General|^Serverless|${benchTitle})`)
  const mainRepoGroup = result.mainRepoStats[groupKey] || {}
  const diffRepoGroup = result.diffRepoStats[groupKey] || {}
  const itemKeys = new Set([
    ...Object.keys(mainRepoGroup),
    ...Object.keys(diffRepoGroup),
  ])

  let groupTable = tableHead
  let mainRepoTotal = 0
  let diffRepoTotal = 0
  let hasItems = false

  itemKeys.forEach((itemKey) => {
    const isGzipItem = itemKey.endsWith('gzip')
    const mainItemVal = mainRepoGroup[itemKey]
    const diffItemVal = diffRepoGroup[itemKey]

    // Skip non-gzip for most groups, skip gzip for serverless
    if (groupKey.startsWith('Serverless') && isGzipItem) return
    if (!isGzipItem && !groupKey.match(gzipIgnoreRegex)) return

    hasItems = true
    const mainItemStr = prettify(mainItemVal, 'bytes')
    const diffItemStr = prettify(diffItemVal, 'bytes')
    const change = formatChange(mainItemVal, diffItemVal, 'bytes')

    if (typeof mainItemVal === 'number') mainRepoTotal += mainItemVal
    if (typeof diffItemVal === 'number') diffRepoTotal += diffItemVal

    groupTable += `| ${shortenLabel(itemKey)} | ${mainItemStr} | ${diffItemStr} | ${change.text} |\n`
  })

  if (!hasItems) return null

  const totalChange = diffRepoTotal - mainRepoTotal
  let totalChangeStr = '✓'

  if (totalChange !== 0) {
    const icon = totalChange > 0 ? '⚠️' : '✅'
    const sign = totalChange > 0 ? '+' : '-'
    totalChangeStr = `${icon} ${sign}${prettyBytes(Math.abs(totalChange))}`
  }

  groupTable += `| **Total** | **${prettyBytes(mainRepoTotal)}** | **${prettyBytes(diffRepoTotal)}** | ${totalChangeStr} |\n`

  // Friendly names for groups
  const friendlyNames = {
    'Client Bundles (main, webpack)': 'Main & Webpack',
    'Legacy Client Bundles (polyfills)': 'Polyfills',
    'Client Pages': 'Pages',
    'Client Build Manifests': 'Build Manifests',
    'Rendered Page Sizes': 'HTML Output',
    'Edge SSR bundle Size': 'Edge SSR',
    'Middleware size': 'Middleware',
    'Next Runtimes': 'Runtimes',
    'build cache': 'Build Cache',
  }

  const displayName = friendlyNames[groupKey] || groupKey

  return `<details>
<summary>${displayName}</summary>

${groupTable}
</details>
`
}

function generateBundleSizeSection(result, tableHead) {
  let content = ''

  // Collect all group keys from the result
  const allGroupKeys = new Set([
    ...Object.keys(result.mainRepoStats || {}),
    ...Object.keys(result.diffRepoStats || {}),
  ])

  // Organize groups by bundler and category
  const bundlerGroups = {}
  const nonBundlerGroups = { client: [], server: [], other: [] }

  for (const groupKey of allGroupKeys) {
    if (groupKey === 'General' || groupKey === benchTitle) continue

    const bundler = getBundlerFromGroupKey(groupKey)
    const baseGroup = getBaseGroupName(groupKey)

    if (bundler) {
      if (!bundlerGroups[bundler.name]) {
        bundlerGroups[bundler.name] = { icon: bundler.icon, groups: [] }
      }
      bundlerGroups[bundler.name].groups.push(groupKey)
    } else {
      // Categorize non-bundler groups
      if (BASE_BUNDLE_GROUPS.client.includes(baseGroup)) {
        nonBundlerGroups.client.push(groupKey)
      } else if (BASE_BUNDLE_GROUPS.server.includes(baseGroup)) {
        nonBundlerGroups.server.push(groupKey)
      } else {
        nonBundlerGroups.other.push(groupKey)
      }
    }
  }

  // Generate content for bundler-specific groups
  for (const [bundlerName, bundlerData] of Object.entries(bundlerGroups)) {
    let bundlerContent = ''
    let hasAny = false

    // Organize bundler groups by category
    const categorizedGroups = { client: [], server: [], other: [] }
    for (const groupKey of bundlerData.groups) {
      const baseGroup = getBaseGroupName(groupKey)
      if (BASE_BUNDLE_GROUPS.client.includes(baseGroup)) {
        categorizedGroups.client.push(groupKey)
      } else if (BASE_BUNDLE_GROUPS.server.includes(baseGroup)) {
        categorizedGroups.server.push(groupKey)
      } else {
        categorizedGroups.other.push(groupKey)
      }
    }

    // Client bundles
    if (categorizedGroups.client.length > 0) {
      let clientContent = ''
      for (const groupKey of categorizedGroups.client) {
        const groupContent = generateBundleGroup(groupKey, result, tableHead)
        if (groupContent) {
          hasAny = true
          clientContent += groupContent
        }
      }
      if (clientContent) {
        bundlerContent += `**Client**\n${clientContent}\n`
      }
    }

    // Server bundles
    if (categorizedGroups.server.length > 0) {
      let serverContent = ''
      for (const groupKey of categorizedGroups.server) {
        const groupContent = generateBundleGroup(groupKey, result, tableHead)
        if (groupContent) {
          hasAny = true
          serverContent += groupContent
        }
      }
      if (serverContent) {
        bundlerContent += `**Server**\n${serverContent}\n`
      }
    }

    // Other bundles (collapsed)
    if (categorizedGroups.other.length > 0) {
      let otherContent = ''
      for (const groupKey of categorizedGroups.other) {
        const groupContent = generateBundleGroup(groupKey, result, tableHead)
        if (groupContent) {
          hasAny = true
          otherContent += groupContent
        }
      }
      if (otherContent) {
        bundlerContent += `<details>\n<summary><strong>Build Details</strong></summary>\n\n${otherContent}</details>\n\n`
      }
    }

    if (hasAny) {
      content += `### ${bundlerData.icon} ${bundlerName}\n\n${bundlerContent}`
    }
  }

  // Handle any non-bundler-specific groups (shouldn't happen but fallback)
  for (const [categoryKey, groups] of Object.entries(nonBundlerGroups)) {
    if (groups.length === 0) continue

    let categoryContent = ''
    let hasAny = false

    for (const groupKey of groups) {
      const groupContent = generateBundleGroup(groupKey, result, tableHead)
      if (groupContent) {
        hasAny = true
        categoryContent += groupContent
      }
    }

    if (hasAny) {
      const titles = {
        client: '📦 Client',
        server: '🖥️ Server',
        other: '🔧 Other',
      }
      content += `### ${titles[categoryKey]}\n\n${categoryContent}`
    }
  }

  return content ? `## Bundle Sizes\n\n${content}` : ''
}

function generateDiffsSection(result) {
  if (!result.diffs || Object.keys(result.diffs).length === 0) return ''

  const diffKeys = Object.keys(result.diffs)
  const diffCount = diffKeys.length

  // Just show count and list of changed files, keep diffs collapsed
  let content = `<details>\n<summary><strong>📝 Changed Files</strong> (${diffCount} file${diffCount === 1 ? '' : 's'})</summary>\n\n`

  // List files that changed
  content += '**Files with changes:**\n'
  for (const itemKey of diffKeys.slice(0, 20)) {
    content += `- \`${shortenLabel(itemKey)}\`\n`
  }
  if (diffKeys.length > 20) {
    content += `- ... and ${diffKeys.length - 20} more\n`
  }

  // Show actual diffs in nested collapsed sections
  content += '\n<details>\n<summary>View diffs</summary>\n\n'
  for (const [itemKey, diff] of Object.entries(result.diffs)) {
    content += `<details>\n<summary>${shortenLabel(itemKey)}</summary>\n\n`
    if (diff.length > 36000) {
      content += 'Diff too large to display'
    } else {
      content += `\`\`\`diff\n${diff}\n\`\`\``
    }
    content += '\n</details>\n'
  }
  content += '</details>\n'

  content += '</details>\n\n'
  return content
}

// ============================================================================
// Main Export
// ============================================================================

// Hidden marker to identify stats comments (invisible in rendered markdown)
const STATS_COMMENT_MARKER = '<!-- __NEXT_STATS_COMMENT__ -->'

module.exports = async function addComment(
  results = [],
  actionInfo,
  statsConfig
) {
  // Load historical data
  const history = await loadHistory()

  // Build the comment with hidden marker for identification
  let comment = `${STATS_COMMENT_MARKER}\n## ${
    actionInfo.isRelease
      ? statsConfig.commentReleaseHeading || 'Stats from current release'
      : statsConfig.commentHeading || 'Stats from current PR'
  }\n\n`

  const tableHead = `| | Canary | PR | Change |\n|:--|--:|--:|--:|\n`

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const isLastResult = i === results.length - 1

    // Add summary showing only significant changes (not collapsed)
    if (i === 0) {
      comment += generateChangeSummary(
        result.mainRepoStats,
        result.diffRepoStats,
        history
      )
    }

    // Add performance section (collapsed by default)
    const perfSection = generatePerformanceSection(
      result.mainRepoStats,
      result.diffRepoStats,
      history
    )
    if (perfSection) {
      comment += `<details>\n<summary><strong>📊 All Metrics</strong></summary>\n\n${perfSection}</details>\n\n`
    }

    // Add bundle sizes (collapsed by default)
    const bundleSection = generateBundleSizeSection(result, tableHead)
    if (bundleSection) {
      comment += `<details>\n<summary><strong>📦 Bundle Sizes</strong></summary>\n\n${bundleSection}</details>\n\n`
    }

    // Add diffs (already collapsed)
    comment += generateDiffsSection(result)

    if (!isLastResult) {
      comment += '<hr/>\n\n'
    }
  }

  // Save canary stats to history (only for releases, not PR comparisons)
  // This ensures we only track official canary metrics, not PR-specific data
  if (results.length > 0 && actionInfo.isRelease && actionInfo.commitId) {
    const mainStats = results[0].mainRepoStats
    if (mainStats?.General) {
      const entry = {
        commitId: actionInfo.commitId,
        timestamp: new Date().toISOString(),
        metrics: { ...mainStats.General },
      }
      await saveToHistory(entry)
    }
  }

  // Output locally or post to GitHub
  if (process.env.LOCAL_STATS) {
    const statsPath = path.resolve('pr-stats.md')
    await fs.writeFile(statsPath, comment)
    console.log(`Output PR stats to ${statsPath}`)
  } else {
    logger('\n--stats start--\n', comment, '\n--stats end--\n')
  }

  if (
    actionInfo.customCommentEndpoint ||
    (actionInfo.githubToken && actionInfo.commentEndpoint)
  ) {
    const body = {
      body: comment,
      ...(!actionInfo.githubToken
        ? {
            isRelease: actionInfo.isRelease,
            commitId: actionInfo.commitId,
            issueId: actionInfo.issueId,
          }
        : {}),
    }

    if (actionInfo.customCommentEndpoint) {
      logger(`Using body ${JSON.stringify({ ...body, body: 'OMITTED' })}`)
    }

    try {
      // Try to find existing stats comment to update
      let existingCommentId = null
      const commentHeading =
        statsConfig.commentHeading || 'Stats from current PR'

      if (actionInfo.githubToken && actionInfo.commentEndpoint) {
        try {
          const existingRes = await fetch(actionInfo.commentEndpoint, {
            headers: {
              Authorization: `bearer ${actionInfo.githubToken}`,
            },
          })

          if (existingRes.ok) {
            const comments = await existingRes.json()
            // Find comment with our hidden marker, or fall back to heading match
            // The marker ensures we only update our own stats comments
            const existing = comments.find(
              (c) =>
                c.body &&
                (c.body.includes(STATS_COMMENT_MARKER) ||
                  // Legacy fallback: match by heading (for comments before marker was added)
                  ((c.body.startsWith(`## ${commentHeading}`) ||
                    c.body.startsWith(`# ${commentHeading}`)) &&
                    c.body.includes('Canary') &&
                    c.body.includes('Change')))
            )
            if (existing) {
              existingCommentId = existing.id
              logger(`Found existing comment ${existingCommentId} to update`)
            }
          }
        } catch (e) {
          logger.error('Failed to fetch existing comments:', e)
        }
      }

      // Update existing or create new
      let endpoint = actionInfo.commentEndpoint
      let method = 'POST'

      if (existingCommentId && actionInfo.githubToken) {
        // GitHub API: PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}
        endpoint = actionInfo.commentEndpoint.replace(
          /\/issues\/\d+\/comments$/,
          `/issues/comments/${existingCommentId}`
        )
        method = 'PATCH'
        logger(`Updating existing comment at ${endpoint}`)
      } else {
        logger(`Creating new comment at ${endpoint}`)
      }

      const res = await fetch(endpoint, {
        method,
        headers: {
          ...(actionInfo.githubToken
            ? {
                Authorization: `bearer ${actionInfo.githubToken}`,
              }
            : {
                'content-type': 'application/json',
              }),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        logger.error(`Failed to ${method} results ${res.status}`)
        try {
          logger.error(await res.text())
        } catch (_) {
          /* no-op */
        }
      } else {
        logger(
          `Successfully ${method === 'PATCH' ? 'updated' : 'posted'} results`
        )
      }
    } catch (err) {
      logger.error(`Error occurred posting results`, err)
    }
  } else {
    logger(
      `Not posting results`,
      actionInfo.githubToken ? 'No comment endpoint' : 'no GitHub token'
    )
  }
}
