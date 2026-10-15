import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildApp, startApp } from './src/app.mjs'
import { launchChrome, selectRendererLog, v8LogFlags } from './src/chrome.mjs'
import { Remapper } from './src/remap.mjs'
import { analyzeLog, matchesFilters, writeArtifacts } from './src/report.mjs'
import { repoRoot, timestamp } from './src/util.mjs'

const USAGE = `Usage:
  pnpm bench:deopt --scenario <name> [options]      run a scenario from bench/deopt/scenarios/
  pnpm bench:deopt --entry <script.mjs> [options]   run any Node script under V8 logging (server-side code)

Options:
  --filter <substring>   only report findings whose source path matches (repeatable;
                         defaults to the scenario's own filter list)
  --all                  ignore filters, report everything
  --fail-on <category>   exit non-zero if a matching finding exists (repeatable);
                         one of: deopt, megamorphic, polymorphic, soft-deopt, lazy-deopt
  --chrome <path>        Chromium executable (default: Playwright's install, or CHROME_PATH)
  --force-build          rebuild the fixture app even on a build-cache hit
  --out <dir>            artifacts directory (default: bench/deopt/artifacts/<scenario>-<time>)
`

const FAIL_ON_CATEGORIES = {
  deopt: ['deopt-eager'],
  megamorphic: ['ic-megamorphic', 'ic-generic'],
  polymorphic: ['ic-polymorphic'],
  'soft-deopt': ['deopt-soft'],
  'lazy-deopt': ['deopt-lazy'],
}

function parseArgs(argv) {
  const args = {
    scenario: null,
    entry: null,
    filters: [],
    all: false,
    failOn: [],
    chrome: null,
    forceBuild: false,
    out: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} requires a value`)
      return argv[++i]
    }
    switch (arg) {
      case '--scenario':
        args.scenario = next()
        break
      case '--entry':
        args.entry = next()
        break
      case '--filter':
        args.filters.push(next())
        break
      case '--all':
        args.all = true
        break
      case '--fail-on': {
        const value = next()
        if (!FAIL_ON_CATEGORIES[value]) {
          throw new Error(
            `Unknown --fail-on value: ${value}. One of: ${Object.keys(FAIL_ON_CATEGORIES).join(', ')}`
          )
        }
        args.failOn.push(value)
        break
      }
      case '--chrome':
        args.chrome = next()
        break
      case '--force-build':
        args.forceBuild = true
        break
      case '--out':
        args.out = next()
        break
      case '--help':
      case '-h':
        console.log(USAGE)
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`)
    }
  }
  if (!args.scenario && !args.entry) {
    throw new Error(`One of --scenario or --entry is required.\n\n${USAGE}`)
  }
  if (args.scenario && args.entry) {
    throw new Error('--scenario and --entry are mutually exclusive')
  }
  return args
}

async function loadScenario(name) {
  const dir = path.join(import.meta.dirname, 'scenarios', name)
  const file = path.join(dir, 'scenario.mjs')
  if (!fs.existsSync(file)) {
    const available = fs
      .readdirSync(path.join(import.meta.dirname, 'scenarios'), {
        withFileTypes: true,
      })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    throw new Error(
      `Unknown scenario "${name}". Available: ${available.join(', ')}`
    )
  }
  const mod = await import(pathToFileURL(file))
  return { ...mod.default, dir }
}

async function runNodeEntry(entry, outDir) {
  const logDir = path.join(outDir, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  const logFile = path.join(logDir, 'v8.log')
  const flags = v8LogFlags(logDir)
    .filter((f) => !f.startsWith('--logfile='))
    .concat([`--logfile=${logFile}`, '--no-logfile-per-isolate'])
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...flags, path.resolve(entry)], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${entry} exited with code ${code}`))
    )
  })
  return { logFile }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const name =
    args.scenario ?? path.basename(args.entry, path.extname(args.entry))
  const outDir = args.out
    ? path.resolve(args.out)
    : path.join(import.meta.dirname, 'artifacts', `${name}-${timestamp()}`)
  fs.mkdirSync(outDir, { recursive: true })

  const meta = {
    scenario: name,
    date: new Date().toISOString(),
    node: process.version,
    next: JSON.parse(
      fs.readFileSync(
        path.join(repoRoot(), 'packages/next/package.json'),
        'utf8'
      )
    ).version,
  }

  let logFile
  let baseURL = null
  let appDir = null
  let filters = args.filters

  if (args.entry) {
    ;({ logFile } = await runNodeEntry(args.entry, outDir))
  } else {
    const scenario = await loadScenario(args.scenario)
    if (scenario.type !== 'browser') {
      throw new Error(
        `Scenario "${args.scenario}" has unknown type "${scenario.type}"`
      )
    }
    if (filters.length === 0 && !args.all) {
      filters = scenario.filter ?? []
    }
    appDir = scenario.app ? path.join(scenario.dir, scenario.app) : null

    const logDir = path.join(outDir, 'logs')
    let server = null
    let chrome = null
    try {
      if (appDir) {
        await buildApp(appDir, { force: args.forceBuild })
        server = await startApp(appDir)
        baseURL = server.url
      }
      chrome = await launchChrome({ logDir, executablePath: args.chrome })
      meta.chromium = chrome.version
      console.error(
        `[bench-deopt] chromium ${chrome.version}, driving scenario…`
      )
      await scenario.drive({
        page: chrome.page,
        context: chrome.context,
        baseURL,
        scenarioDir: scenario.dir,
      })
      const sentinel = chrome.sentinel
      await chrome.context.close()
      await chrome.browser.close()
      chrome = null
      const { selected, all, sentinelFound } = selectRendererLog(
        logDir,
        sentinel
      )
      if (!sentinelFound) {
        console.error(
          '[bench-deopt] warning: sentinel not found in any log; using the largest log file'
        )
      }
      console.error(
        `[bench-deopt] selected renderer log ${path.basename(selected)} (${all.length} isolate logs total)`
      )
      logFile = selected
    } finally {
      if (chrome) await chrome.browser.close().catch(() => {})
      if (server) await server.stop()
    }
  }

  // Keep the raw log as the primary artifact for the Deopt Explorer extension.
  const v8LogPath = path.join(outDir, 'v8.log')
  fs.copyFileSync(logFile, v8LogPath)

  if (args.all) filters = []
  meta.filters = filters.length > 0 ? filters.join(', ') : '(none)'

  const remapper = new Remapper({ baseURL, appDir })
  const logText = fs.readFileSync(logFile, 'utf8')
  const { findings: allFindings, icError } = await analyzeLog({
    logText,
    remapper,
  })
  const findings = allFindings.filter((f) => matchesFilters(f, filters))

  writeArtifacts({ outDir, findings, allFindings, meta, icError })

  console.log('')
  console.log(
    `Findings (${findings.length} matching filters, ${allFindings.length} total):`
  )
  const counts = {}
  for (const f of findings) counts[f.category] = (counts[f.category] ?? 0) + 1
  for (const [category, count] of Object.entries(counts)) {
    console.log(`  ${category}: ${count}`)
  }
  if (icError) {
    console.log(`  (IC analysis unavailable: ${icError})`)
  }

  const highs = findings.filter((f) => f.severity === 'high')
  if (highs.length > 0) {
    console.log('')
    console.log('High severity:')
    const shown = highs.slice(0, 15)
    for (const f of shown) {
      const fn = f.functionName || '(anonymous)'
      const detail = f.kind === 'deopt' ? f.reason : `${f.icState} access`
      const loc = f.original
        ? `${f.module}:${f.original.line ?? '?'}`
        : `${f.module}:${f.line ?? '?'}`
      console.log(`  ${fn} — ${detail}  (${loc})`)
    }
    if (highs.length > shown.length) {
      console.log(`  … and ${highs.length - shown.length} more in summary.md`)
    }
  }
  console.log('')
  console.log(`Artifacts: ${outDir}`)
  console.log(`  summary.md    human-readable report`)
  console.log(`  findings.txt  stable snapshot-style list`)
  console.log(`  v8.log        open in VS Code: "Deopt Explorer: Open V8 Log"`)

  if (args.failOn.length > 0) {
    const failCategories = new Set(
      args.failOn.flatMap((f) => FAIL_ON_CATEGORIES[f])
    )
    const failing = findings.filter((f) => failCategories.has(f.category))
    if (failing.length > 0) {
      console.error(
        `\n--fail-on: ${failing.length} finding(s) in categories [${[...failCategories].join(', ')}]`
      )
      process.exit(1)
    }
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err))
  process.exit(1)
})
