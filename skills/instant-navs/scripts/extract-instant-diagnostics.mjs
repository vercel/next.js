#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const files = process.argv.slice(2)

if (files.length === 0) {
  console.error(
    'Usage: extract-instant-diagnostics.mjs <log-or-trace-file> [...]'
  )
  process.exit(1)
}

const patterns = [
  ['blocking-route', /blocking-route/i],
  ['instant-validation', /INSTANT_VALIDATION_ERROR/i],
  ['static-bailout', /NEXT_STATIC_GEN_BAILOUT|throwIfDisallowedDynamic/i],
  ['uncached-data', /encountered uncached data|uncached data/i],
  [
    'render-prevented-validation',
    /Could not validate unstable_instant because an error prevented/i,
  ],
  ['workstore-invariant', /Expected workStore to be initialized/i],
  [
    'request-scope',
    /cookies\(\) outside a request scope|headers\(\) outside a request scope/i,
  ],
  [
    'stale-export',
    /Attempted import error|export .* was not found|is not exported/i,
  ],
  ['use-client-fallback', /server Suspense fallback|server shell|use client/i],
  [
    'translation-function',
    /t\([^)]+\).*is not a function|is not a function.*t\(|missing.*translation|translation key|i18n.*is not a function|locale provider|server locale/i,
  ],
  ['rewrite', /x-middleware-rewrite|x-nextjs-rewritten-path/i],
  ['instant-cookie', /next-instant-navigation-testing/i],
  ['postponed', /x-nextjs-postponed/i],
  ['route-path', /Route "\/[^"]+"|\/\[[^\]]+\][^\s"']*/i],
  [
    'first-stack-frame',
    /^\s+at\s+(cookies|headers|generateStaticParams|rootParams|Providers|Layout|Page)\b/,
  ],
  ['stack-overflow', /Maximum call stack size exceeded|RangeError/i],
]

const maxHitsPerLabel = 4
const maxLineLength = 260

function trimLine(line) {
  if (line.length <= maxLineLength) {
    return line
  }
  return `${line.slice(0, maxLineLength)} ... [trimmed ${line.length - maxLineLength} chars]`
}

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (error) {
    return `__READ_ERROR__ ${error.message}`
  }
}

function context(lines, index) {
  const start = Math.max(0, index - 2)
  const end = Math.min(lines.length, index + 3)
  return lines.slice(start, end).map((line, offset) => {
    const lineNumber = start + offset + 1
    return `${lineNumber}: ${trimLine(line)}`
  })
}

for (const file of files) {
  const text = readFile(file)
  const lines = text.split(/\r?\n/)
  const hits = []
  const seen = new Set()
  const counts = new Map()

  lines.forEach((line, index) => {
    for (const [label, pattern] of patterns) {
      const count = counts.get(label) ?? 0
      if (count >= maxHitsPerLabel) {
        continue
      }
      if (!pattern.test(line)) {
        continue
      }
      const match = line.match(pattern)?.[0]
      const key = `${label}:${index}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      counts.set(label, count + 1)
      hits.push({ label, index, match, context: context(lines, index) })
    }
  })

  console.log(`\n## ${path.relative(process.cwd(), file)}`)

  if (text.startsWith('__READ_ERROR__')) {
    console.log(text)
    continue
  }

  if (hits.length === 0) {
    console.log('No Instant diagnostics matched.')
    continue
  }

  for (const hit of hits) {
    console.log(`\n### ${hit.label} at line ${hit.index + 1}`)
    if (hit.match) {
      console.log(`match: ${trimLine(hit.match)}`)
    }
    console.log(hit.context.join('\n'))
  }

  const capped = [...counts.entries()].filter(
    ([, count]) => count >= maxHitsPerLabel
  )
  if (capped.length > 0) {
    console.log(
      `\nCapped repeated labels at ${maxHitsPerLabel}: ${capped
        .map(([label]) => label)
        .join(', ')}`
    )
  }
}
