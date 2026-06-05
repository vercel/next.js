#!/usr/bin/env node
// @ts-check
/**
 * Structural static analysis of a Next.js App Router tree for Cache Components
 * ("dynamic IO"). Dependency-free — reads source, never runs the app.
 *
 *   node scan.mjs [appDir]            human-readable report
 *   node scan.mjs [appDir] --json     machine-readable inventory
 *
 * It builds the route/segment tree and inventories every dynamic-IO site
 * (request APIs, params/searchParams, uncached fetch/DB, nondeterminism),
 * every Suspense boundary + fallback shape, every `'use cache'` directive, and
 * every `generateStaticParams`. It then emits CANDIDATE flags.
 *
 * The flags are high-recall, not precise: a regex cannot prove an `await` is
 * top-level vs nested, nor that a site is covered by a `<Suspense>` in an
 * ANCESTOR layout. Treat every flag as "read this file + its ancestor layouts
 * to confirm" — that confirmation step is the agent's job (see analysis.md).
 * The build on canary is the oracle, not this script.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROLE_FILES = new Set([
  'page',
  'layout',
  'template',
  'loading',
  'default',
  'error',
  'global-error',
  'not-found',
  'forbidden',
  'unauthorized',
  'route',
])
const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js', '.mjs'])
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build'])

function findAppDir(root) {
  // Prefer app/ and src/app/ over the passed root so route paths are correct.
  for (const c of [
    path.join(root, 'app'),
    path.join(root, 'src', 'app'),
    root,
  ]) {
    if (
      fs.existsSync(c) &&
      fs.statSync(c).isDirectory() &&
      walkRouteFiles(c).length
    ) {
      return c
    }
  }
  return null
}

function walkRouteFiles(dir, acc = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) walkRouteFiles(path.join(dir, e.name), acc)
    } else {
      const ext = path.extname(e.name)
      const base = path.basename(e.name, ext)
      if (EXTS.has(ext) && ROLE_FILES.has(base))
        acc.push(path.join(dir, e.name))
    }
  }
  return acc
}

/** Turn an app-relative dir into a route path, classifying its segments. */
function routeForDir(appDir, dir) {
  const rel = path.relative(appDir, dir)
  if (rel === '') return { route: '/', dynamic: [], slots: [] }
  const parts = rel.split(path.sep)
  const dynamic = []
  const slots = []
  const out = []
  for (const p of parts) {
    if (p.startsWith('(') && p.endsWith(')')) continue // route group — no URL
    if (p.startsWith('@')) {
      slots.push(p.slice(1))
      continue // parallel slot — no URL segment
    }
    if (p.startsWith('[[...') && p.endsWith(']]')) {
      dynamic.push({ name: p.slice(5, -2), kind: 'optional-catch-all' })
      out.push(p)
    } else if (p.startsWith('[...') && p.endsWith(']')) {
      dynamic.push({ name: p.slice(4, -1), kind: 'catch-all' })
      out.push(p)
    } else if (p.startsWith('[') && p.endsWith(']')) {
      dynamic.push({ name: p.slice(1, -1), kind: 'dynamic' })
      out.push(p)
    } else {
      out.push(p)
    }
  }
  return { route: '/' + out.join('/'), dynamic, slots }
}

const RX = {
  useClient: /^\s*['"]use client['"]/,
  useCache: /^\s*['"]use cache(?::\s*\w+)?['"]/,
  requestApi: /\b(cookies|headers|draftMode|connection)\s*\(/,
  awaitParams: /\bawait\s+[\w.]*\bparams\b/,
  awaitSearchParams: /\bawait\s+[\w.]*\bsearchParams\b/,
  useSearchParams: /\buseSearchParams\s*\(/,
  fetch: /\bfetch\s*\(/,
  db: /\b(db|prisma|drizzle|knex|sql|pool|client)\b[^\n]*\.\s*(find\w*|query|select|exec\w*|getMany|get|all|raw)\s*\(/,
  awaitImport: /\bawait\s+import\s*\(/,
  nondeterministic:
    /\b(Math\.random|Date\.now|crypto\.randomUUID)\s*\(|new\s+Date\s*\(\s*\)/,
  suspense: /<Suspense\b/,
  gsp: /\bgenerateStaticParams\b/,
  genMeta: /\bgenerate(Metadata|Viewport)\b/,
  awaitAny: /\bawait\b/,
  returnJsx: /\breturn\s*[(<]/,
}

/**
 * Blank out comments and string-literal contents (line-preserving) so matchers
 * never fire on a keyword that only appears in a comment or a string. Returns
 * code-only lines the same length as the input; use the ORIGINAL lines for
 * snippets. Multi-line template literals are not tracked (rare in route files).
 */
function stripComments(src) {
  const out = []
  let inBlock = false
  for (const line of src.split(/\r?\n/)) {
    let res = ''
    let i = 0
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i)
        if (end === -1) {
          res += ' '.repeat(line.length - i)
          i = line.length
        } else {
          res += ' '.repeat(end + 2 - i)
          i = end + 2
          inBlock = false
        }
        continue
      }
      const ch = line[i]
      if (ch === '"' || ch === "'" || ch === '`') {
        res += ch
        i++
        while (i < line.length) {
          res += line[i]
          if (line[i] === '\\') {
            i++
            if (i < line.length) res += line[i]
            i++
            continue
          }
          if (line[i] === ch) {
            i++
            break
          }
          i++
        }
        continue
      }
      if (ch === '/' && line[i + 1] === '*') {
        inBlock = true
        res += '  '
        i += 2
        continue
      }
      if (ch === '/' && line[i + 1] === '/') {
        res += ' '.repeat(line.length - i)
        i = line.length
        continue
      }
      res += ch
      i++
    }
    out.push(res)
  }
  return out
}

function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8')
  const lines = src.split(/\r?\n/)
  const code = stripComments(src) // match on this; snippet from `lines`
  const head = code.slice(0, 5).join('\n')
  const isClient = RX.useClient.test(head)
  // File-level `'use cache'` (column 0, top of file) caches ALL exports, so a
  // request API anywhere in the file really is inside a cached scope. A
  // function-level (indented) directive does not implicate the rest of the file.
  const fileLevelUseCache = code
    .slice(0, 3)
    .some((l) => /^['"]use cache(?::\s*\w+)?['"]/.test(l))
  const directives = []
  const sites = []
  const boundaries = []
  let hasSuspense = false
  let hasGsp = false
  let hasGenMeta = false
  let firstReturnLine = Infinity

  const add = (kind, i, line) =>
    sites.push({ kind, line: i + 1, snippet: line.trim().slice(0, 120) })

  for (let i = 0; i < code.length; i++) {
    const cl = code[i] // comment/string-stripped — match on this
    const sn = lines[i] ?? '' // original — use for the snippet
    if (RX.useCache.test(cl)) directives.push(cl.trim().replace(/['"]/g, ''))
    if (i < firstReturnLine && RX.returnJsx.test(cl)) firstReturnLine = i
    if (RX.requestApi.test(cl)) add('request-api', i, sn)
    if (RX.awaitParams.test(cl)) add('await-params', i, sn)
    if (RX.awaitSearchParams.test(cl)) add('await-searchParams', i, sn)
    if (RX.useSearchParams.test(cl)) add('useSearchParams', i, sn)
    if (RX.fetch.test(cl)) add('fetch', i, sn)
    if (RX.db.test(cl)) add('db', i, sn)
    if (RX.awaitImport.test(cl)) add('await-import', i, sn)
    if (RX.nondeterministic.test(cl)) add('nondeterministic', i, sn)
    if (RX.gsp.test(cl)) hasGsp = true
    if (RX.genMeta.test(cl)) hasGenMeta = true
    if (RX.suspense.test(cl)) {
      hasSuspense = true
      // crude fallback-shape read: look at this line + next 2 (code-only)
      const open = (cl + (code[i + 1] || '') + (code[i + 2] || '')).slice(
        cl.indexOf('<Suspense')
      )
      const tag = open.slice(
        0,
        open.indexOf('>') === -1 ? 200 : open.indexOf('>') + 1
      )
      let fallback = 'none'
      if (/fallback=\{?\s*null\s*\}?/.test(tag)) fallback = 'null'
      else if (/fallback=/.test(tag)) fallback = 'element'
      boundaries.push({ line: i + 1, fallback })
    }
  }

  // top-level-ish await: an `await` BEFORE the first JSX return in a route
  // component (heuristic for "awaiting request data at the top, gating the
  // subtree"). Only meaningful in page/layout/template files.
  const topLevelAwaitLines = []
  for (let i = 0; i < Math.min(firstReturnLine, code.length); i++) {
    if (RX.awaitAny.test(code[i]) && !RX.useCache.test(code[i])) {
      topLevelAwaitLines.push(i + 1)
    }
  }

  return {
    isClient,
    fileLevelUseCache,
    directives,
    sites,
    boundaries,
    hasSuspense,
    hasGsp,
    hasGenMeta,
    topLevelAwaitLines,
    requestApiSites: sites.filter((s) =>
      ['request-api', 'await-params', 'await-searchParams'].includes(s.kind)
    ),
  }
}

function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const root = path.resolve(args.find((a) => !a.startsWith('--')) || '.')
  const appDir = findAppDir(root)
  if (!appDir) {
    console.error(
      `No App Router directory found under ${root} (looked for ./, ./app, ./src/app).`
    )
    process.exit(2)
  }

  const files = walkRouteFiles(appDir)
  const byDir = new Map()
  const fileReports = []
  for (const file of files) {
    const role = path.basename(file, path.extname(file))
    const dir = path.dirname(file)
    const r = scanFile(file)
    const relFile = path.relative(root, file)
    fileReports.push({ file: relFile, role, dir, ...r })
    if (!byDir.has(dir)) byDir.set(dir, [])
    byDir.get(dir).push({ role, file: relFile, ...r })
  }

  const segments = []
  const gspByDir = new Map() // absolute dir → segment has generateStaticParams
  for (const [dir, roleReports] of byDir) {
    const { route, dynamic, slots } = routeForDir(appDir, dir)
    gspByDir.set(
      dir,
      roleReports.some((r) => r.hasGsp)
    )
    segments.push({
      route,
      dir: path.relative(root, dir),
      dynamic,
      slots,
      roles: roleReports.map((r) => r.role).sort(),
      hasGenerateStaticParams: roleReports.some((r) => r.hasGsp),
      hasLoading: roleReports.some((r) => r.role === 'loading'),
    })
  }
  segments.sort((a, b) => a.route.localeCompare(b.route))

  // ---- candidate flags (confirm by reading; see analysis.md) ----
  const flags = []
  const flag = (severity, code, file, line, message) =>
    flags.push({ severity, code, file, line, message })

  for (const fr of fileReports) {
    const isRoute = ['page', 'layout', 'template'].includes(fr.role)

    // request/param read with NO Suspense anywhere in the file → likely outside
    // a boundary (unless an ancestor layout wraps it — confirm).
    if (isRoute && fr.requestApiSites.length && !fr.hasSuspense) {
      for (const s of fr.requestApiSites) {
        // `await params` is shell-safe when the segment enumerates them with
        // generateStaticParams — don't flag it as a dynamic read then.
        if (s.kind === 'await-params' && gspByDir.get(fr.dir)) continue
        flag(
          'high',
          'dynamic-read-no-boundary-in-file',
          fr.file,
          s.line,
          `${s.kind} with no <Suspense> in this file — confirm an ancestor layout covers it, else push down behind a boundary (or root-param for params).`
        )
      }
    }

    // top-level await before the JSX return in a layout/page → gates the subtree
    if (isRoute && fr.topLevelAwaitLines.length && fr.role !== 'loading') {
      flag(
        fr.role === 'layout' ? 'high' : 'medium',
        'top-level-await',
        fr.file,
        fr.topLevelAwaitLines[0],
        `await before the JSX return in a ${fr.role} — if it reads request/uncached data it blocks everything below. Pass the promise down + unwrap in a Suspense child.`
      )
    }

    // request API inside a FILE-LEVEL 'use cache' → cannot cache request data.
    // (Function-level directives are skipped — `'use cache'` in one helper and
    //  a request read in a separate component is the CORRECT pattern; the build
    //  oracle catches any genuine same-scope violation.)
    if (fr.fileLevelUseCache && fr.requestApiSites.length) {
      flag(
        'high',
        'request-data-in-use-cache',
        fr.file,
        fr.requestApiSites[0].line,
        `file-level 'use cache' AND a request API (${fr.requestApiSites[0].kind}) — request data can't be cached. Move the read out of the cached scope.`
      )
    }

    // uncached fetch/db with no Suspense and no 'use cache' in file
    const ioSites = fr.sites.filter((s) =>
      ['fetch', 'db', 'await-import'].includes(s.kind)
    )
    if (isRoute && ioSites.length && !fr.hasSuspense && !fr.directives.length) {
      flag(
        'medium',
        'uncached-io-no-boundary',
        fr.file,
        ioSites[0].line,
        `uncached ${ioSites[0].kind} with no <Suspense> and no 'use cache' — cache it (shared) or wrap it in Suspense (per-request).`
      )
    }

    // blank fallback below root
    for (const b of fr.boundaries) {
      if (b.fallback !== 'element') {
        flag(
          'low',
          'blank-or-missing-fallback',
          fr.file,
          b.line,
          `<Suspense> fallback is ${b.fallback} — fine only if the child renders nothing on success; otherwise give it a real region-shaped skeleton (blank-shell trap).`
        )
      }
    }
  }

  for (const seg of segments) {
    // dynamic param segment with no generateStaticParams → fallback route,
    // params are request-time for the whole subtree.
    const hasPage = seg.roles.includes('page')
    if (hasPage && seg.dynamic.length && !seg.hasGenerateStaticParams) {
      flag(
        'high',
        'dynamic-param-no-generateStaticParams',
        seg.dir,
        null,
        `route ${seg.route} has dynamic param(s) [${seg.dynamic
          .map((d) => d.name)
          .join(
            ', '
          )}] but no generateStaticParams → fallback route (params deferred for the whole subtree). Enumerate them (root-param lever) or confirm params are consumed only behind <Suspense>.`
      )
    }
    // coarse loading.tsx → candidate for decomposition
    if (seg.hasLoading) {
      flag(
        'low',
        'coarse-loading-file',
        seg.dir,
        null,
        `route ${seg.route} has loading.tsx — it suspends the WHOLE segment. Confirm the segment isn't mostly static; if it is, decompose into per-region <Suspense> in the page and remove/shrink loading.tsx.`
      )
    }
  }

  const result = {
    root,
    appDir: path.relative(root, appDir) || '.',
    segments,
    files: fileReports,
    flags,
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  // ---- human report ----
  const bySev = { high: [], medium: [], low: [] }
  for (const f of flags) bySev[f.severity].push(f)
  console.log(
    `\nApp Router: ${result.appDir}  (${segments.length} segments, ${files.length} route files)\n`
  )
  console.log('Route table (static read — verify against `next build`):')
  for (const s of segments) {
    if (!s.roles.includes('page')) continue
    const marks = []
    if (s.dynamic.length)
      marks.push(s.hasGenerateStaticParams ? 'param+gsp' : 'param,NO-gsp')
    if (s.hasLoading) marks.push('loading.tsx')
    if (s.slots.length) marks.push(`@${s.slots.join(',@')}`)
    console.log(`  ${s.route.padEnd(36)} ${marks.join('  ')}`)
  }
  for (const sev of ['high', 'medium', 'low']) {
    if (!bySev[sev].length) continue
    console.log(
      `\n${sev.toUpperCase()} candidates (${bySev[sev].length}) — confirm by reading, then apply a lever:`
    )
    for (const f of bySev[sev]) {
      const loc = f.line ? `${f.file}:${f.line}` : f.file
      console.log(`  [${f.code}] ${loc}\n      ${f.message}`)
    }
  }
  console.log(
    `\nNext: read each HIGH candidate + its ancestor layouts (analysis.md), plan the lever (levers.md), refactor, then \`next build\` on canary (the oracle).\n`
  )
}

main()
