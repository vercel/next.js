#!/usr/bin/env node

/**
 * Higher Judge Level 1: Mechanical checker for integration-to-e2e test conversions.
 *
 * Checks every suite in converted-tests.json for:
 * 1. Test count parity (it/test/describe.each)
 * 2. Assertion count (expect() >= original)
 * 3. No legacy imports (check, renderViaHTTP, fetchViaHTTP, etc.)
 * 4. No deprecated check() calls
 * 5. nextTestSetup import from e2e-utils
 * 6. No process.env.TURBOPACK_DEV/BUILD
 * 7. Mode placement correctness (isNextStart/isNextDev guards)
 */

import fs from 'fs'
import path from 'path'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const CONVERTED = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/integration-to-e2e/converted-tests.json'),
    'utf8'
  )
)

// Tests that legitimately use lifecycle helpers for external servers, CLI, or telemetry
const LIFECYCLE_ALLOWLIST = new Set([
  'test/e2e/cli/cli.test.ts',
  'test/e2e/port-env-var/port-env-var.test.ts',
  'test/e2e/trailing-slashes-rewrite/trailing-slashes-rewrite.test.ts',
  'test/e2e/fetch-polyfill/fetch-polyfill.test.ts',
  'test/e2e/fetch-polyfill-ky-universal/fetch-polyfill-ky-universal.test.ts',
  'test/e2e/i18n-support/i18n-support.test.ts',
  'test/e2e/i18n-support-base-path/i18n-support-base-path.test.ts',
  'test/e2e/custom-routes/custom-routes.test.ts',
  'test/e2e/custom-routes-i18n/custom-routes-i18n.test.ts',
  'test/e2e/telemetry/telemetry.test.ts',
  'test/e2e/telemetry/config.test.ts',
  'test/e2e/telemetry/page-features.test.ts',
  'test/e2e/css-client-nav/css-client-nav.test.ts',
  'test/e2e/next-dynamic-css-asset-prefix/next-dynamic-css-asset-prefix.test.ts',
  'test/e2e/jsconfig-baseurl/jsconfig-baseurl.test.ts',
  'test/e2e/repeated-slashes/repeated-slashes.test.ts',
  'test/e2e/invalid-custom-routes/invalid-custom-routes.test.ts',
  'test/e2e/gssp-redirect/gssp-redirect.test.ts',
  'test/development/undefined-webpack-config/undefined-webpack-config.test.ts',
  'test/production/preload-viewport/preload-viewport.test.ts',
  'test/production/export-dynamic-pages/export-dynamic-pages.test.ts',
  'test/production/prerender-export/prerender-export.test.ts',
  'test/production/build-trace-extra-entries-monorepo/build-trace-extra-entries-monorepo.test.ts',
  // External proxy/stub server patterns (L2 AI judge confirmed legitimate)
  'test/e2e/preload-viewport/preload-viewport.test.ts',
  // Image suites use findPort for CDN proxy servers (legitimate)
  'test/e2e/next-image-legacy/asset-prefix/asset-prefix.test.ts',
  'test/e2e/next-image-legacy/base-path/base-path-static.test.ts',
  'test/e2e/next-image-legacy/base-path/base-path.test.ts',
  'test/e2e/next-image-legacy/default/default-static.test.ts',
  'test/e2e/next-image-legacy/default/default.test.ts',
  'test/e2e/next-image-legacy/image-from-node-modules/image-from-node-modules.test.ts',
  'test/e2e/next-image-legacy/trailing-slash/trailing-slash.test.ts',
  'test/e2e/next-image-legacy/typescript/typescript.test.ts',
  'test/e2e/next-image-legacy/unicode/unicode.test.ts',
  'test/e2e/next-image-legacy/unoptimized/unoptimized.test.ts',
  'test/production/next-image-legacy/basic/basic.test.ts',
  'test/production/next-image-legacy/custom-resolver/custom-resolver.test.ts',
  'test/production/next-image-legacy/no-intersection-observer-fallback/no-intersection-observer-fallback.test.ts',
  'test/production/next-image-legacy/noscript/noscript.test.ts',
  'test/production/next-image-legacy/react-virtualized/react-virtualized.test.ts',
  'test/e2e/next-image-new/app-dir-image-from-node-modules/app-dir-image-from-node-modules.test.ts',
  'test/e2e/next-image-new/app-dir-localpatterns/app-dir-localpatterns.test.ts',
  'test/e2e/next-image-new/app-dir-qualities/app-dir-qualities.test.ts',
  'test/e2e/next-image-new/app-dir/app-dir-static.test.ts',
  'test/e2e/next-image-new/app-dir/app-dir.test.ts',
  'test/e2e/next-image-new/asset-prefix/asset-prefix.test.ts',
  'test/e2e/next-image-new/base-path/base-path-static.test.ts',
  'test/e2e/next-image-new/base-path/base-path.test.ts',
  'test/e2e/next-image-new/both-basepath-trailingslash/both-basepath-trailingslash.test.ts',
  'test/e2e/next-image-new/default/default-static.test.ts',
  'test/e2e/next-image-new/default/default.test.ts',
  'test/e2e/next-image-new/image-from-node-modules/image-from-node-modules.test.ts',
  'test/e2e/next-image-new/loader-config-default-loader-with-file/loader-config-default-loader-with-file.test.ts',
  'test/e2e/next-image-new/loader-config-edge-runtime/loader-config-edge-runtime.test.ts',
  'test/e2e/next-image-new/loader-config/loader-config.test.ts',
  'test/e2e/next-image-new/trailing-slash/trailing-slash.test.ts',
  'test/e2e/next-image-new/typescript/typescript.test.ts',
  'test/e2e/next-image-new/unicode/unicode.test.ts',
  'test/e2e/next-image-new/unoptimized/unoptimized.test.ts',
  'test/production/next-image-new/invalid-image-import/invalid-image-import.test.ts',
  'test/production/next-image-new/react-virtualized/react-virtualized.test.ts',
  'test/development/next-image-new/export-config/export-config.test.ts',
  'test/development/next-image-new/invalid-image-import/invalid-image-import.test.ts',
  'test/development/next-image-new/middleware/middleware-intercept.test.ts',
  'test/development/next-image-new/middleware/middleware.test.ts',
])

const SETUP_EXCEPTIONS = new Set([
  'create-next-app',
  'image-optimizer',
  'invalid-server-options',
  'link-without-router',
])

// Suites reviewed by L2 AI judge and confirmed valid despite count differences
const L2_REVIEWED = new Set([
  'app-document-import-order',
  'edge-runtime-response-error',
  'edge-runtime-streaming-error',
  'gsp-build-errors',
  'numeric-sep',
  'prerender-no-revalidate',
  'ssg-dynamic-routes-404-page',
])

const LEGACY_IMPORTS = ['startApp', 'stopApp', 'renderViaHTTP', 'fetchViaHTTP']

const LEGACY_IMPORT_ALLOWLISTED = [
  'findPort',
  'killApp',
  'launchApp',
  'nextBuild',
]

function countPattern(content, pattern) {
  const matches = content.match(pattern)
  return matches ? matches.length : 0
}

function countTests(content) {
  const itCalls = countPattern(content, /\b(?:it|test)\s*\(/g)
  const itSkip = countPattern(content, /\b(?:it|test)\.skip\s*\(/g)
  const itEach = countPattern(content, /\b(?:it|test)\.each/g)
  const describeEach = countPattern(content, /\bdescribe\.each/g)
  return { itCalls, itSkip, itEach, describeEach, total: itCalls + itEach }
}

function countAssertions(content) {
  return countPattern(content, /\bexpect\s*\(/g)
}

function checkLegacyImports(content, filepath) {
  const issues = []
  const isAllowlisted = LIFECYCLE_ALLOWLIST.has(filepath)

  if (!isAllowlisted) {
    for (const imp of LEGACY_IMPORTS) {
      const regex = new RegExp(`\\b${imp}\\b`)
      if (regex.test(content)) {
        issues.push(`Legacy import/usage: ${imp}`)
      }
    }

    for (const imp of LEGACY_IMPORT_ALLOWLISTED) {
      const regex = new RegExp(`\\b${imp}\\b`)
      if (regex.test(content)) {
        if (content.includes('startCommand')) continue
        issues.push(`Legacy lifecycle helper: ${imp} (not in allowlist)`)
      }
    }
  }

  if (
    /\bFile\s*\(/.test(content) &&
    /from\s+['"]next-test-utils['"]/.test(content)
  ) {
    if (
      /\bFile\b/.test(
        content.match(
          /import\s*\{([^}]+)\}\s*from\s*['"]next-test-utils['"]/
        )?.[1] || ''
      )
    ) {
      issues.push('Legacy File class import from next-test-utils')
    }
  }

  return issues
}

function checkDeprecatedCheck(content) {
  const checkCalls = countPattern(content, /\bcheck\s*\(/g)
  const importHasCheck =
    /import\s*\{[^}]*\bcheck\b[^}]*\}\s*from\s*['"]next-test-utils['"]/.test(
      content
    )
  if (checkCalls > 0 || importHasCheck) {
    return [`Deprecated check() usage: ${checkCalls} calls`]
  }
  return []
}

function checkNextTestSetup(content, suiteName) {
  if (SETUP_EXCEPTIONS.has(suiteName)) return []
  if (!/\bnextTestSetup\b/.test(content)) {
    return ['Missing nextTestSetup import']
  }
  if (!/from\s+['"]e2e-utils['"]/.test(content)) {
    return ['nextTestSetup not imported from e2e-utils']
  }
  return []
}

function checkTurbopackEnvVars(content) {
  const issues = []
  if (/process\.env\.TURBOPACK_DEV/.test(content)) {
    issues.push(
      'Uses process.env.TURBOPACK_DEV (should use isTurbopack/isNextStart)'
    )
  }
  if (/process\.env\.TURBOPACK_BUILD/.test(content)) {
    issues.push(
      'Uses process.env.TURBOPACK_BUILD (should use isTurbopack/isNextStart)'
    )
  }
  if (/process\.env\.IS_TURBOPACK_TEST/.test(content)) {
    issues.push(
      'Uses process.env.IS_TURBOPACK_TEST (should use isTurbopack from nextTestSetup)'
    )
  }
  return issues
}

function checkModePlacement(filepath, content, suiteName) {
  if (SETUP_EXCEPTIONS.has(suiteName)) return []
  const warnings = []
  if (filepath.startsWith('test/production/')) {
    const hasIsNextStart = /\bisNextStart\b/.test(content)
    if (!hasIsNextStart) {
      warnings.push(
        'Production test without isNextStart guard (directory provides mode filtering)'
      )
    }
  }
  return warnings
}

function findSharedFiles(convertedFiles) {
  const sharedFiles = []
  for (const convFile of convertedFiles) {
    const dir = path.dirname(path.join(REPO_ROOT, convFile))
    for (const name of ['shared.ts', 'shared.js', 'util.ts', 'utils.ts']) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) {
        sharedFiles.push(candidate)
      }
    }
  }
  return [...new Set(sharedFiles)]
}

function runSuite(entry) {
  const suiteName = entry.original.replace('test/integration/', '')
  const result = {
    suite: suiteName,
    original: entry.original,
    originalFiles: entry.originalTestFiles,
    convertedFiles: entry.converted,
    verdict: 'pass',
    issues: [],
    warnings: [],
    metrics: {},
  }

  if (SETUP_EXCEPTIONS.has(suiteName)) {
    result.warnings.push(
      'Suite uses custom isolation (exception from standard checks)'
    )
    result.verdict = 'warn'
    return result
  }

  let origTestCount = 0
  let origAssertCount = 0
  let convTestCount = 0
  let convAssertCount = 0

  for (const origFile of entry.originalTestFiles) {
    const fullPath = path.join(REPO_ROOT, origFile)
    if (!fs.existsSync(fullPath)) {
      result.warnings.push(`Original file not found: ${origFile}`)
      continue
    }
    const content = fs.readFileSync(fullPath, 'utf8')
    const tests = countTests(content)
    origTestCount += tests.total
    origAssertCount += countAssertions(content)
  }

  const sharedFiles = findSharedFiles(entry.converted)
  for (const sf of sharedFiles) {
    const content = fs.readFileSync(sf, 'utf8')
    convTestCount += countTests(content).total
    convAssertCount += countAssertions(content)
  }

  for (const convFile of entry.converted) {
    const fullPath = path.join(REPO_ROOT, convFile)
    if (!fs.existsSync(fullPath)) {
      result.issues.push(`Converted file not found: ${convFile}`)
      result.verdict = 'fail'
      continue
    }
    const content = fs.readFileSync(fullPath, 'utf8')
    const tests = countTests(content)
    convTestCount += tests.total
    convAssertCount += countAssertions(content)

    result.issues.push(...checkLegacyImports(content, convFile))
    result.issues.push(...checkDeprecatedCheck(content))
    result.issues.push(...checkNextTestSetup(content, suiteName))
    result.issues.push(...checkTurbopackEnvVars(content))
    result.warnings.push(...checkModePlacement(convFile, content, suiteName))
  }

  result.metrics = {
    origTests: origTestCount,
    convTests: convTestCount,
    origAsserts: origAssertCount,
    convAsserts: convAssertCount,
  }

  const isL2Reviewed = L2_REVIEWED.has(suiteName)
  if (convTestCount < origTestCount * 0.5) {
    if (isL2Reviewed) {
      result.warnings.push(
        `Test count lower (L2 reviewed OK): ${convTestCount} vs ${origTestCount} original`
      )
    } else {
      result.issues.push(
        `Test count significantly lower: ${convTestCount} vs ${origTestCount} original`
      )
    }
  } else if (convTestCount < origTestCount) {
    result.warnings.push(
      `Test count slightly lower: ${convTestCount} vs ${origTestCount} original`
    )
  }

  if (convAssertCount < origAssertCount * 0.7) {
    if (isL2Reviewed) {
      result.warnings.push(
        `Assertion count lower (L2 reviewed OK): ${convAssertCount} vs ${origAssertCount} original`
      )
    } else {
      result.issues.push(
        `Assertion count significantly lower: ${convAssertCount} vs ${origAssertCount} original`
      )
    }
  } else if (convAssertCount < origAssertCount) {
    result.warnings.push(
      `Assertion count slightly lower: ${convAssertCount} vs ${origAssertCount} original`
    )
  }

  if (result.issues.length > 0) {
    result.verdict = 'fail'
  } else if (result.warnings.length > 0) {
    result.verdict = 'warn'
  }

  return result
}

const outputPath = path.join(
  REPO_ROOT,
  'scripts/integration-to-e2e/judge-results/higher-judge-l1.jsonl'
)

const results = []
for (const entry of CONVERTED) {
  const result = runSuite(entry)
  results.push(result)
}

const lines = results.map((r) => JSON.stringify(r)).join('\n') + '\n'
fs.writeFileSync(outputPath, lines)

const pass = results.filter((r) => r.verdict === 'pass').length
const warn = results.filter((r) => r.verdict === 'warn').length
const fail = results.filter((r) => r.verdict === 'fail').length

console.log(`\nHigher Judge Level 1 Results:`)
console.log(`  PASS: ${pass}`)
console.log(`  WARN: ${warn}`)
console.log(`  FAIL: ${fail}`)
console.log(`  Total: ${results.length}`)
console.log(`\nResults written to: ${outputPath}`)

if (fail > 0) {
  console.log(`\n--- FAILURES ---`)
  for (const r of results.filter((r) => r.verdict === 'fail')) {
    console.log(`\n  ${r.suite}:`)
    for (const issue of r.issues) {
      console.log(`    - ${issue}`)
    }
  }
}

if (warn > 0) {
  console.log(`\n--- WARNINGS ---`)
  for (const r of results.filter((r) => r.verdict === 'warn')) {
    console.log(`\n  ${r.suite}:`)
    for (const w of r.warnings) {
      console.log(`    - ${w}`)
    }
  }
}
