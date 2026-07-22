// Configuration for the sandbox-bench scripts.
//
// Everything machine- or team-specific lives in a config file OUTSIDE the
// repo (never commit team/project names into the repo):
//   ~/.config/sandbox-bench/config.json
//
// Required fields (no defaults — ask the user once, then save):
//   team     Vercel team slug the sandboxes bill to
//   project  Vercel project the sandboxes attach to
// Optional fields:
//   cacheDir     where clones/artifacts/snapshot-ids live
//                (default ~/.cache/sandbox-bench)
//   reactRepo    existing react checkout to use (default: auto-clone
//                into <cacheDir>/react)
//   nextRepo     existing next.js checkout to use (default: auto-clone
//                into <cacheDir>/next)
//   reactRepoUrl clone/fetch URL (default https://github.com/react/react.git)
//   nextRepoUrl  clone/fetch URL (default https://github.com/vercel/next.js.git)
//   vercelBin    vercel CLI binary (default "vercel")
//
// CLI: node config.mjs show
//      node config.mjs set team=<slug> project=<name> [key=value...]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'sandbox-bench')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export function loadConfig({ requireScope = true } = {}) {
  let cfg = {}
  if (fs.existsSync(CONFIG_FILE)) {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  }
  // Env overrides for CI or one-off use.
  cfg.team = process.env.SANDBOX_BENCH_TEAM ?? cfg.team
  cfg.project = process.env.SANDBOX_BENCH_PROJECT ?? cfg.project
  cfg.cacheDir = expandHome(
    process.env.SANDBOX_BENCH_CACHE ?? cfg.cacheDir ?? '~/.cache/sandbox-bench'
  )
  cfg.reactRepo = expandHome(
    process.env.SANDBOX_BENCH_REACT_REPO ?? cfg.reactRepo ?? ''
  )
  cfg.nextRepo = expandHome(
    process.env.SANDBOX_BENCH_NEXT_REPO ?? cfg.nextRepo ?? ''
  )
  cfg.reactRepoUrl = cfg.reactRepoUrl ?? 'https://github.com/react/react.git'
  cfg.nextRepoUrl = cfg.nextRepoUrl ?? 'https://github.com/vercel/next.js.git'
  cfg.vercelBin = cfg.vercelBin ?? 'vercel'
  if (requireScope && (!cfg.team || !cfg.project)) {
    throw new Error(
      'sandbox-bench is not configured: team and project are required.\n' +
        'Ask the user which Vercel team + project the sandbox VMs should ' +
        'run under, then save them with:\n' +
        `  node ${path.relative(process.cwd(), new URL(import.meta.url).pathname)} ` +
        'set team=<team-slug> project=<project-name>\n' +
        '(Stored in ~/.config/sandbox-bench/config.json, not in the repo.)'
    )
  }
  return cfg
}

export function saveConfig(patch) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const existing = fs.existsSync(CONFIG_FILE)
    ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    : {}
  const merged = { ...existing, ...patch }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + '\n')
  return merged
}

function expandHome(p) {
  if (!p) return p
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
}

// Scope flags appended to every `vercel sandbox` call. Never widen scope
// beyond the configured team/project: the project may be shared.
export function sandboxScope(cfg) {
  return ['--team', cfg.team, '--project', cfg.project]
}

// Repos: use the configured checkout, else clone lazily into the cache.
function ensureRepo(cfg, checkout, url, name) {
  if (checkout && fs.existsSync(path.join(checkout, '.git'))) return checkout
  const dest = path.join(cfg.cacheDir, name)
  if (fs.existsSync(path.join(dest, '.git'))) return dest
  fs.mkdirSync(cfg.cacheDir, { recursive: true })
  console.error(`cloning ${url} into ${dest} (one-time)...`)
  execFileSync('git', ['clone', '--filter=blob:none', url, dest], {
    stdio: 'inherit',
  })
  return dest
}
export function ensureReactRepo(cfg) {
  return ensureRepo(cfg, cfg.reactRepo, cfg.reactRepoUrl, 'react')
}
export function ensureNextRepo(cfg) {
  return ensureRepo(cfg, cfg.nextRepo, cfg.nextRepoUrl, 'next')
}

// ------------------------------------------------------------------ CLI
// realpath both sides: /tmp vs /private/tmp (macOS) or any symlinked
// invocation path must not silently skip the CLI (a no-op "config set"
// would leave stale team/project in effect with exit 0).
function isMain() {
  if (!process.argv[1]) return false
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(new URL(import.meta.url).pathname)
    )
  } catch {
    return false
  }
}
if (isMain()) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'show') {
    let cfg
    try {
      cfg = loadConfig({ requireScope: false })
    } catch (e) {
      console.error(e.message)
      process.exit(1)
    }
    console.log(JSON.stringify(cfg, null, 2))
    if (!cfg.team || !cfg.project) {
      console.error('\nNOT CONFIGURED: team/project missing (see file header).')
      process.exit(2)
    }
  } else if (cmd === 'set') {
    const patch = {}
    for (const kv of rest) {
      const i = kv.indexOf('=')
      if (i < 0) {
        console.error(`bad argument "${kv}", want key=value`)
        process.exit(1)
      }
      patch[kv.slice(0, i)] = kv.slice(i + 1)
    }
    const merged = saveConfig(patch)
    console.log(`saved: ${JSON.stringify(merged, null, 2)}`)
  } else {
    console.error('usage: node config.mjs show | set key=value [key=value...]')
    process.exit(1)
  }
}
