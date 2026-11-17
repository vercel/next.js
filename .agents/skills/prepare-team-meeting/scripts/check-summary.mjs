#!/usr/bin/env node
// Usage:
//   node check-summary.mjs --prs <out>/prs.json --doc <summary.md> [--max-lines 200]
//
// Checks a team meeting summary against the PRs that fetch-prs.mjs wrote, and
// prints one line per problem. Exits 1 on errors. Warnings (📊 lines that
// might be missing) don't fail the check, but review each one.
//
// The document format it expects:
//
//   - **<Category>** (@owner)            category, top level, 1–2 owners
//     - ✅ <change> [#123](<url>) …       PR item: status emoji, then links
//       - 📊 #123: <benchmark>            details (benchmarks, decisions)
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const STATUS = { '✅': 'merged', '🔄': 'open', '📝': 'draft' }
const CATEGORY_RE = /^- \*\*(.+?)\*\* \((@[\w-]+(?:, @[\w-]+)?)\)\s*$/
const PR_ITEM_RE = /^ {2}- (✅|🔄|📝) /
const LINK_RE = /\[#(\d+)\]\(([^)\s]+)\)/g
const BENCH_RE = /^ {4}- 📊 \[?#(\d+)\b/

export function checkSummary(data, doc, { maxLines = 200 } = {}) {
  const errors = []
  const warnings = []
  const prs = new Map(data.prs.map((pr) => [pr.number, pr]))
  const lines = doc.replace(/\n$/, '').split('\n')

  if (lines.length > maxLines) {
    errors.push(`document has ${lines.length} lines, the limit is ${maxLines}`)
  }

  const seen = new Set()
  const benchmarked = new Set()
  let owners = null
  lines.forEach((line, i) => {
    const at = `line ${i + 1}`
    if (/^#{2,} /.test(line)) {
      errors.push(
        `${at}: use a top-level "- **Category** (@owner)" item, not a heading`
      )
      return
    }
    if (line.startsWith('- ')) {
      const m = line.match(CATEGORY_RE)
      if (!m) {
        errors.push(
          `${at}: top-level items must be "- **Category** (@owner)": ${line.slice(0, 80)}`
        )
        owners = null
        return
      }
      owners = m[2].split(', ').map((o) => o.slice(1))
      return
    }
    const bench = line.match(BENCH_RE)
    if (bench) benchmarked.add(Number(bench[1]))
    const item = line.match(PR_ITEM_RE)
    const links = [...line.matchAll(LINK_RE)]
    if (!item) {
      // Details may mention PRs, but every PR must also have a status item.
      for (const [, num] of links) {
        if (!prs.has(Number(num))) {
          errors.push(`${at}: #${num} is not in prs.json`)
        }
      }
      return
    }
    if (owners === null) {
      errors.push(`${at}: PR item outside of a category`)
      return
    }
    if (links.length === 0) errors.push(`${at}: PR item without a PR link`)
    for (const [, num, url] of links) {
      const pr = prs.get(Number(num))
      if (!pr) {
        errors.push(`${at}: #${num} is not in prs.json`)
        continue
      }
      seen.add(pr.number)
      if (url !== pr.url) errors.push(`${at}: #${num} links to ${url}`)
      if (STATUS[item[1]] !== pr.status) {
        errors.push(`${at}: #${num} is ${pr.status}, flagged ${item[1]}`)
      }
      if (!owners.includes(pr.author)) {
        errors.push(
          `${at}: #${num} is by @${pr.author}, listed under @${owners.join(', @')}`
        )
      }
    }
  })

  for (const pr of data.prs) {
    if (!seen.has(pr.number)) {
      errors.push(`#${pr.number} (@${pr.author}, ${pr.status}) is missing`)
    } else if (pr.hasNumbers && !benchmarked.has(pr.number)) {
      warnings.push(
        `#${pr.number}: its description has numbers but no 📊 line. Fine if they aren't performance measurements.`
      )
    }
  }
  return { errors, warnings, lines: lines.length, covered: seen.size }
}

function parseArgs(argv) {
  const args = { maxLines: 200 }
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]]
    if (value === undefined) throw new Error(`${key} needs a value`)
    if (key === '--prs') args.prs = value
    else if (key === '--doc') args.doc = value
    else if (key === '--max-lines') args.maxLines = Number(value)
    else throw new Error(`Unknown argument: ${key}`)
  }
  if (!args.prs || !args.doc) throw new Error('Pass --prs and --doc')
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const data = JSON.parse(fs.readFileSync(args.prs, 'utf8'))
  const doc = fs.readFileSync(args.doc, 'utf8')
  const result = checkSummary(data, doc, args)
  for (const e of result.errors) console.log(`error: ${e}`)
  for (const w of result.warnings) console.log(`warning: ${w}`)
  console.log(
    `${result.covered}/${data.prs.length} PRs covered, ${result.lines} lines, ` +
      `${result.errors.length} errors, ${result.warnings.length} warnings`
  )
  process.exit(result.errors.length ? 1 : 0)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main()
  } catch (err) {
    console.error(`check-summary: ${err.message}`)
    process.exit(2)
  }
}
