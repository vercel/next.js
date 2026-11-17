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
//   # <Team> PRs: <since>–<until>              title with the window
//   Legend: …                                  free text before the first category
//   **Totals:** <n> ✅ · <n> 🔄 · <n> 📝         must match prs.json
//
//   - **<Category>** (@owner)                  category: top level, 1–2 owners
//     - ✅ <change> [#123](<url>) …             PR item: status emoji, then links
//       - 📊 #123: <benchmark>                  details: 📊 / ❓ / ☑️ / free text
//
// The checker can't verify judgement calls: whether something is really
// breaking, whether a decision is real, or whether two owners share a PR.
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

export const HARD_MAX_LINES = 200
const STATUS = { '✅': 'merged', '🔄': 'open', '📝': 'draft' }
const CATEGORY_RE = /^- \*\*(.+?)\*\* \((@[\w-]+(?:, @[\w-]+)?)\)\s*$/
const PR_ITEM_RE = /^ {2}- (✅|🔄|📝) \S/
const DETAIL_RE = /^ {4}- \S/
const LINK_RE = /\[#(\d+)\]\(([^)\s]+)\)/g
const BENCH_RE = /^ {4}- 📊 \[?#(\d+)\b/
const TOTALS_RE = /\*\*Totals:\*\* (\d+) ✅ · (\d+) 🔄 · (\d+) 📝/

export const USAGE =
  'Usage: node check-summary.mjs --prs <prs.json> --doc <summary.md> [--max-lines 200]'

export function checkSummary(data, doc, { maxLines = HARD_MAX_LINES } = {}) {
  if (
    !Number.isSafeInteger(maxLines) ||
    maxLines <= 0 ||
    maxLines > HARD_MAX_LINES
  ) {
    throw new Error(
      `maxLines must be an integer from 1 to ${HARD_MAX_LINES}, got ${maxLines}`
    )
  }
  const errors = []
  const warnings = []
  const prs = new Map(data.prs.map((pr) => [pr.number, pr]))
  const lines = doc.replace(/\n$/, '').split('\n')

  if (lines.length > maxLines) {
    errors.push(`document has ${lines.length} lines, the limit is ${maxLines}`)
  }

  // Header: the window in the title, totals matching prs.json.
  const title = lines[0] ?? ''
  if (!title.startsWith('# ')) {
    errors.push(
      'line 1: the document must start with a "# <Team> PRs: …" title'
    )
  } else if (
    data.window &&
    !(title.includes(data.window.since) && title.includes(data.window.until))
  ) {
    errors.push(
      `line 1: the title must contain the window ${data.window.since}–${data.window.until}`
    )
  }
  const totalsLine = lines.find((l) => TOTALS_RE.test(l))
  if (!totalsLine) {
    errors.push('missing "**Totals:** <n> ✅ · <n> 🔄 · <n> 📝" line')
  } else {
    const [, merged, open, draft] = totalsLine.match(TOTALS_RE).map(Number)
    const actual = { merged: 0, open: 0, draft: 0 }
    for (const pr of data.prs) actual[pr.status]++
    if (
      merged !== actual.merged ||
      open !== actual.open ||
      draft !== actual.draft
    ) {
      errors.push(
        `totals say ${merged}/${open}/${draft}, prs.json has ` +
          `${actual.merged}/${actual.open}/${actual.draft} (merged/open/draft)`
      )
    }
  }

  const seen = new Set()
  const benchmarked = new Set()
  let owners = null // owners of the current category
  let item = null // PR numbers of the current PR item
  let inBody = false // past the first category

  const checkLink = (at, num, url) => {
    const pr = prs.get(num)
    // Details may mention PRs outside the report, e.g. a stacked base or a
    // baseline. Only check the URLs of PRs in prs.json.
    if (pr && url !== pr.url) errors.push(`${at}: #${num} links to ${url}`)
    return pr
  }

  lines.forEach((line, i) => {
    const at = `line ${i + 1}`
    if (line.trim() === '') return
    if (/^#{2,} /.test(line)) {
      errors.push(
        `${at}: use a top-level "- **Category** (@owner)" item, not a heading`
      )
      return
    }
    if (/^\s*\d+[.)] /.test(line)) {
      errors.push(`${at}: use "- " lists, not numbered lists`)
      return
    }
    const isList = /^\s*[-*+] /.test(line)
    if (!isList) {
      if (inBody) errors.push(`${at}: text outside of a list item`)
      return
    }

    if (line.startsWith('- ')) {
      inBody = true
      item = null
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

    if (/^ {2}[-*+] /.test(line)) {
      item = null
      const status = line.match(PR_ITEM_RE)
      if (!status) {
        errors.push(
          `${at}: PR items must start with ✅, 🔄 or 📝: ${line.slice(0, 80)}`
        )
        return
      }
      if (owners === null) {
        errors.push(`${at}: PR item outside of a category`)
        return
      }
      const links = [...line.matchAll(LINK_RE)]
      if (links.length === 0) {
        errors.push(`${at}: PR item without a PR link`)
        return
      }
      item = new Set()
      for (const [, n, url] of links) {
        const num = Number(n)
        const pr = checkLink(at, num, url)
        if (!pr) {
          errors.push(`${at}: #${num} is not in prs.json`)
          continue
        }
        item.add(num)
        if (seen.has(num)) errors.push(`${at}: #${num} is listed twice`)
        seen.add(num)
        if (STATUS[status[1]] !== pr.status) {
          errors.push(`${at}: #${num} is ${pr.status}, flagged ${status[1]}`)
        }
        if (!owners.includes(pr.author)) {
          errors.push(
            `${at}: #${num} is by @${pr.author}, listed under @${owners.join(', @')}`
          )
        }
      }
      return
    }

    if (DETAIL_RE.test(line)) {
      if (item === null) {
        errors.push(`${at}: detail line without a PR item above it`)
        return
      }
      for (const [, n, url] of line.matchAll(LINK_RE)) {
        checkLink(at, Number(n), url)
      }
      const bench = line.match(BENCH_RE)
      if (bench) {
        const num = Number(bench[1])
        if (!item.has(num)) {
          errors.push(
            `${at}: 📊 #${num} is not one of the PRs in the item above`
          )
        } else {
          benchmarked.add(num)
        }
      } else if (line.startsWith('    - 📊')) {
        errors.push(`${at}: 📊 lines must start with the PR number: "📊 #N:"`)
      }
      return
    }

    errors.push(
      `${at}: list items must be indented by 0, 2 or 4 spaces: ${line.slice(0, 80)}`
    )
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

export function parseArgs(argv) {
  const raw = {}
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]]
    if (!['--prs', '--doc', '--max-lines'].includes(key)) {
      throw new Error(`Unknown argument: ${key}`)
    }
    if (key in raw) throw new Error(`${key} was passed more than once`)
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new Error(`${key} needs a value`)
    }
    raw[key] = value
  }
  if (!raw['--prs'] || !raw['--doc']) throw new Error('Pass --prs and --doc')
  const limit = raw['--max-lines'] ?? String(HARD_MAX_LINES)
  if (!/^\d+$/.test(limit)) {
    throw new Error(`--max-lines must be a positive integer, got "${limit}"`)
  }
  return { prs: raw['--prs'], doc: raw['--doc'], maxLines: Number(limit) }
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  const args = parseArgs(argv)
  const data = JSON.parse(fs.readFileSync(args.prs, 'utf8'))
  const doc = fs.readFileSync(args.doc, 'utf8')
  const result = checkSummary(data, doc, args)
  for (const e of result.errors) console.log(`error: ${e}`)
  for (const w of result.warnings) console.log(`warning: ${w}`)
  console.log(
    `${result.covered}/${data.prs.length} PRs covered, ${result.lines} lines, ` +
      `${result.errors.length} errors, ${result.warnings.length} warnings`
  )
  return result.errors.length ? 1 : 0
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    process.exitCode = main()
  } catch (err) {
    console.error(`check-summary: ${err.message}`)
    console.error(USAGE)
    process.exitCode = 2
  }
}
