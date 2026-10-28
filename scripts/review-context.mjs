#!/usr/bin/env node
// Computes the deterministic parts of a review, so the agent doesn't have to:
// which areas a PR touches (per review/OWNERS), their owners and rubrics,
// whether the author owns them, and how many lines of implementation code
// changed. The review harness runs this and passes the output to the agent.
//
// Default owners (for PRs that match no area) aren't fixed: each run picks
// two team members at random who committed in the past week. The team is
// everyone listed as an owner in review/OWNERS. Recent commits come from the
// GitHub API, using GITHUB_TOKEN when it's set; without it, the pick is from
// the whole team. Pass --seed (e.g. the PR number) so reruns on the same PR
// pick the same people.
// TODO: request the Next.js oncall instead, once Vercel Agent supports it.
//
// Usage:
//   node scripts/review-context.mjs [base-ref] [--author <login>] [--seed <n>]
//     diffs base-ref...HEAD (default base: origin/canary)
//   git diff --numstat main | node scripts/review-context.mjs - [--author <login>]
//   node scripts/review-context.mjs --check
//     validates review/OWNERS (run in CI): every area has an owner and a
//     rubric, every rubric has an area, every glob matches a file, and every
//     owner is on the allowlist in .github/workflows/automated_code_review.yml
//
// Output is JSON:
//   { areas: [{ area, owners, authorIsOwner, rubric, files }],
//     defaultOwners, unmatched, implementationLines, totalLines }

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const ownersFile = join(repoRoot, 'review/OWNERS')
const workflowFile = join(
  repoRoot,
  '.github/workflows/automated_code_review.yml'
)

// The logins in the workflow's `contains(fromJSON('[...]'), ...)` allowlist.
function readAllowlist() {
  const match = readFileSync(workflowFile, 'utf8').match(
    /fromJSON\('(\[[^\]]*\])'\)/
  )
  return match ? JSON.parse(match[1]) : null
}

function parseOwners(text) {
  const sections = []
  let current = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const header = line.match(/^\[([^\]]+)\]\s*(.*)$/)
    if (header) {
      current = {
        area: header[1],
        owners: header[2].split(/\s+/).filter(Boolean),
        globs: [],
      }
      sections.push(current)
    } else if (current) {
      current.globs.push(line)
    }
  }
  return sections
}

// Expands {a,b} alternatives, innermost first.
function expandBraces(glob) {
  const match = glob.match(/\{([^{}]*)\}/)
  if (!match) return [glob]
  const before = glob.slice(0, match.index)
  const after = glob.slice(match.index + match[0].length)
  return match[1]
    .split(',')
    .flatMap((alt) => expandBraces(before + alt + after))
}

function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` matches zero or more directories; a trailing `**` matches anything.
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 2
      } else {
        re += '.*'
        i += 1
      }
    } else if (c === '*') {
      re += '[^/]*'
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  // A trailing slash means "this directory", like CODEOWNERS.
  if (glob.endsWith('/')) re += '.*'
  return new RegExp(`^${re}$`)
}

// A colocated test belongs to the area of its sibling source file.
function sourceCandidates(file) {
  const m = file.match(/^(.*)\.test\.(tsx?|jsx?|mjs)$/)
  if (!m) return [file]
  return [file, ...['ts', 'tsx', 'js', 'mjs'].map((ext) => `${m[1]}.${ext}`)]
}

// Changed lines in these paths don't count toward the large-diff trigger.
const NON_IMPLEMENTATION = [
  'test/**',
  '**/*.test.*',
  '**/__tests__/**',
  '**/__snapshots__/**',
  '**/*.snap',
  '**/tests/**',
  '**/__testfixtures__/**',
  '**/fixtures/**',
  'docs/**',
  'examples/**',
  '**/*.md',
  '**/*.mdx',
  'packages/next/src/compiled/**',
  'packages/next/errors.json',
  '**/pnpm-lock.yaml',
  'Cargo.lock',
].map(globToRegExp)

// Reads `git diff --numstat` output: "<added>\t<deleted>\t<path>".
// Binary files show "-" for both counts. A rename shows its path as
// "old => new" or "dir/{old => new}/file"; both paths count as changed, and
// the lines count once, under the new path.
function readNumstat(args) {
  const text =
    args[0] === '-'
      ? readFileSync(0, 'utf8')
      : execFileSync(
          'git',
          [
            'diff',
            '--numstat',
            '--find-renames',
            `${args[0] && !args[0].startsWith('--') ? args[0] : 'origin/canary'}...HEAD`,
          ],
          { cwd: repoRoot, encoding: 'utf8' }
        )
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const [added, deleted, ...rest] = line.split('\t')
      const lines = (Number(added) || 0) + (Number(deleted) || 0)
      const [newPath, oldPath] = renamedPaths(rest.join('\t'))
      return oldPath == null
        ? [{ file: newPath, lines }]
        : [
            { file: newPath, lines },
            { file: oldPath, lines: 0 },
          ]
    })
}

// Returns [newPath, oldPath], or [path] when it isn't a rename.
function renamedPaths(path) {
  const braced = path.match(/^(.*)\{(.*) => (.*)\}(.*)$/)
  if (braced) {
    const [, prefix, from, to, suffix] = braced
    // "dir/{ => sub}/file" leaves an empty segment on one side.
    const join = (middle) => `${prefix}${middle}${suffix}`.replace('//', '/')
    return [join(to), join(from)]
  }
  const parts = path.split(' => ')
  return parts.length === 2 ? [parts[1], parts[0]] : [path]
}

// Logins of everyone who committed to the repo in the past week.
async function recentCommitters() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const headers = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const logins = new Set()
  try {
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(
        `https://api.github.com/repos/vercel/next.js/commits?since=${since}&per_page=100&page=${page}`,
        { headers }
      )
      if (!res.ok) return null
      const commits = await res.json()
      for (const commit of commits) {
        if (commit.author?.login) logins.add(commit.author.login.toLowerCase())
      }
      if (commits.length < 100) break
    }
  } catch {
    return null
  }
  return logins
}

// A small seeded PRNG (mulberry32), so a given seed always picks the same people.
function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function pickDefaultOwners(author, seed) {
  const team = [
    ...new Set(
      sections
        .flatMap((s) => s.owners)
        .filter((o) => o !== '@TODO')
        .map((o) => o.toLowerCase())
    ),
  ]
    .filter((o) => o !== `@${author?.toLowerCase()}`)
    .sort()
  const recent = await recentCommitters()
  const active = recent ? team.filter((o) => recent.has(o.slice(1))) : []
  const pool = active.length >= 2 ? active : team
  const next = random(seed ?? Math.floor(Math.random() * 2 ** 32))
  const picked = []
  while (picked.length < 2 && pool.length > 0) {
    picked.push(pool.splice(Math.floor(next() * pool.length), 1)[0])
  }
  return picked
}

const sections = parseOwners(readFileSync(ownersFile, 'utf8')).map((s) => ({
  ...s,
  patterns: s.globs.flatMap(expandBraces).map(globToRegExp),
}))
function check() {
  const problems = []
  const trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean)
  const allowlist = readAllowlist()
  if (allowlist == null) {
    problems.push(`can't find the author allowlist in ${workflowFile}`)
  }
  const allowed = new Set((allowlist ?? []).map((l) => l.toLowerCase()))
  for (const section of sections) {
    if (section.area === 'default') continue
    const owners = section.owners.filter((o) => o !== '@TODO')
    if (owners.length === 0) {
      problems.push(`[${section.area}] has no owners`)
    }
    for (const owner of owners) {
      if (allowlist != null && !allowed.has(owner.slice(1).toLowerCase())) {
        problems.push(
          `[${section.area}] ${owner} isn't on the allowlist in .github/workflows/automated_code_review.yml`
        )
      }
    }
    if (!existsSync(join(repoRoot, `review/areas/${section.area}.md`))) {
      problems.push(
        `[${section.area}] has no rubric at review/areas/${section.area}.md`
      )
    }
    for (const glob of section.globs) {
      const patterns = expandBraces(glob).map(globToRegExp)
      if (!trackedFiles.some((f) => patterns.some((p) => p.test(f)))) {
        problems.push(`[${section.area}] ${glob} matches no files`)
      }
    }
  }
  const areas = new Set(sections.map((s) => s.area))
  for (const file of readdirSync(join(repoRoot, 'review/areas'))) {
    const area = file.replace(/\.md$/, '')
    if (!file.startsWith('_') && !areas.has(area)) {
      problems.push(
        `review/areas/${file} has no [${area}] section in review/OWNERS`
      )
    }
  }
  for (const problem of problems) console.error(problem)
  process.exit(problems.length ? 1 : 0)
}

const args = process.argv.slice(2)
if (args.includes('--check')) check()
const authorIndex = args.indexOf('--author')
const author = authorIndex === -1 ? null : args[authorIndex + 1]
const seedIndex = args.indexOf('--seed')
const seed = seedIndex === -1 ? null : Number(args[seedIndex + 1])
const changes = readNumstat(args)
const files = changes.map((c) => c.file)

const matched = new Map()
const unmatched = []
for (const file of files) {
  let hit = false
  for (const section of sections) {
    if (section.area === 'default') continue
    const candidates = sourceCandidates(file)
    if (section.patterns.some((p) => candidates.some((f) => p.test(f)))) {
      hit = true
      if (!matched.has(section.area)) {
        const rubric = `review/areas/${section.area}.md`
        matched.set(section.area, {
          area: section.area,
          owners: section.owners,
          authorIsOwner:
            author != null &&
            section.owners.some(
              (o) => o.toLowerCase() === `@${author.toLowerCase()}`
            ),
          rubric: existsSync(join(repoRoot, rubric)) ? rubric : null,
          files: [],
        })
      }
      matched.get(section.area).files.push(file)
    }
  }
  if (!hit) unmatched.push(file)
}

console.log(
  JSON.stringify(
    {
      areas: [...matched.values()],
      defaultOwners: await pickDefaultOwners(author, seed),
      unmatched,
      implementationLines: changes
        .filter((c) => !NON_IMPLEMENTATION.some((p) => p.test(c.file)))
        .reduce((sum, c) => sum + c.lines, 0),
      totalLines: changes.reduce((sum, c) => sum + c.lines, 0),
    },
    null,
    2
  )
)
