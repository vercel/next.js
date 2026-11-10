#!/usr/bin/env node
/**
 * Dev Server Bundle Analyzer
 *
 * Generates a bundle analyzer report for the dev server bundle.
 *
 * Usage:
 *   node scripts/analyze-bundle.js [options]
 *
 * Options:
 *   --open          Open the report in browser (default: false)
 *   --verbose       Show detailed module reasons
 *   --json          Also output stats.json file
 *   --list-modules  List all bundled modules to console
 *   --list-externals List all externalized modules
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// Parse arguments
const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)

const openBrowser = hasFlag('open')
const verbose = hasFlag('verbose')
const outputJson = hasFlag('json')
const listModules = hasFlag('list-modules')
const listExternals = hasFlag('list-externals')

const nextDir = path.join(__dirname, '..', 'packages', 'next')
const bundlePath = path.join(
  nextDir,
  'dist/compiled/dev-server/start-server.js'
)
const reportPath = path.join(
  nextDir,
  'dist/compiled/dev-server/bundle-report.html'
)

console.log('\x1b[34m=== Dev Server Bundle Analyzer ===\x1b[0m')
console.log('')

// Build with analyzer
console.log('Building bundle with analyzer...')
const env = {
  ...process.env,
  ANALYZE: '1',
  ...(verbose ? { ANALYZE_REASONS: '1' } : {}),
}

try {
  execSync('npx taskr next_bundle_dev_server', {
    cwd: nextDir,
    stdio: verbose ? 'inherit' : 'pipe',
    env,
  })
} catch (err) {
  console.error('\x1b[31mBuild failed\x1b[0m')
  process.exit(1)
}

// Get bundle stats
const stats = fs.statSync(bundlePath)
const sizeKB = Math.round(stats.size / 1024)
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)

console.log('')
console.log('\x1b[32mBundle Stats:\x1b[0m')
console.log(`  Size: ${sizeKB} KB (${sizeMB} MB)`)
console.log(`  Path: ${bundlePath}`)
console.log(`  Report: ${reportPath}`)
console.log('')

// List bundled modules
if (listModules) {
  console.log('\x1b[33mBundled Modules:\x1b[0m')
  const content = fs.readFileSync(bundlePath, 'utf-8')
  const moduleMatches = content.match(/"\.\/dist\/[^"]+/g) || []
  const modules = [...new Set(moduleMatches)]
    .map((m) => m.replace(/^"/, ''))
    .filter((m) => !m.includes(' recursive'))
    .sort()

  modules.forEach((m) => console.log(`  ${m}`))
  console.log(`\n  Total: ${modules.length} modules`)
  console.log('')
}

// List externalized modules
if (listExternals) {
  console.log('\x1b[33mExternalized Modules:\x1b[0m')
  const content = fs.readFileSync(bundlePath, 'utf-8')

  // Find external requires
  const externalMatches =
    content.match(
      /require\("(next\/dist\/[^"]+|@next\/[^"]+|styled-jsx[^"]*)"\)/g
    ) || []
  const externals = [...new Set(externalMatches)]
    .map((m) => m.match(/require\("([^"]+)"\)/)[1])
    .sort()

  externals.forEach((m) => console.log(`  ${m}`))
  console.log(`\n  Total: ${externals.length} external requires`)
  console.log('')
}

// Output JSON stats
if (outputJson) {
  const statsJsonPath = path.join(
    nextDir,
    'dist/compiled/dev-server/stats.json'
  )
  console.log(`Stats JSON: ${statsJsonPath}`)
  console.log('(Run with ANALYZE_REASONS=1 for detailed stats)')
}

// Open in browser
if (openBrowser) {
  console.log('Opening report in browser...')
  const opener =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open'
  try {
    execSync(`${opener} "${reportPath}"`, { stdio: 'ignore' })
  } catch {
    console.log(`Could not open browser. Open manually: ${reportPath}`)
  }
}

console.log('\x1b[32mDone!\x1b[0m')
console.log('')
console.log('Tips:')
console.log('  - Open the HTML report to see interactive treemap')
console.log('  - Use --list-modules to see all bundled modules')
console.log('  - Use --list-externals to see external requires')
console.log('  - Use --verbose for detailed build output')
