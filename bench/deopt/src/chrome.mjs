import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

/**
 * The V8 logging flags Deopt Explorer needs. Equivalent to what `dexnode`
 * passes for V8 >= 9 (all supported Node/Chromium versions).
 *
 * `%p` in --logfile expands to the process pid. With the default
 * --logfile-per-isolate, each isolate prefixes `isolate-<addr>-<pid>-` onto
 * the basename, giving one log per isolate in `logDir`.
 */
export function v8LogFlags(logDir) {
  return [
    '--log-deopt',
    '--log-ic',
    '--log-maps',
    '--log-maps-details',
    '--log-code',
    '--log-source-code',
    '--prof',
    '--detailed-line-info',
    `--logfile=${path.join(logDir, 'v8-%p.log')}`,
  ]
}

const MAC_EXECUTABLES = [
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
]
const LINUX_EXECUTABLES = ['chrome-linux/chrome']

function playwrightBrowsersDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return process.env.PLAYWRIGHT_BROWSERS_PATH
  }
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library/Caches/ms-playwright')
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA ?? os.homedir(),
        'ms-playwright'
      )
    default:
      return path.join(os.homedir(), '.cache/ms-playwright')
  }
}

/**
 * Find a Chromium executable. Prefers Playwright's own resolution; falls back
 * to scanning the Playwright browsers cache so a version skew between
 * playwright-core and the installed browsers doesn't block runs.
 */
export function findChromium(explicitPath) {
  const candidate = explicitPath ?? process.env.CHROME_PATH
  if (candidate) {
    if (!fs.existsSync(candidate)) {
      throw new Error(`Chromium executable not found at ${candidate}`)
    }
    return candidate
  }

  try {
    const p = chromium.executablePath()
    if (p && fs.existsSync(p)) return p
  } catch {}

  const browsersDir = playwrightBrowsersDir()
  const executables =
    process.platform === 'darwin' ? MAC_EXECUTABLES : LINUX_EXECUTABLES
  let installs = []
  try {
    installs = fs
      .readdirSync(browsersDir)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  } catch {}
  for (const install of installs) {
    for (const rel of executables) {
      const full = path.join(browsersDir, install, rel)
      if (fs.existsSync(full)) return full
    }
  }

  throw new Error(
    'Could not find a Chromium executable. Run `pnpm playwright install chromium`, ' +
      'or pass one explicitly via --chrome <path> or the CHROME_PATH env var.'
  )
}

/**
 * Launch headless Chromium with V8 logging enabled and return a page whose
 * renderer process can later be identified among the per-isolate logs via a
 * unique sentinel token compiled into every document.
 */
export async function launchChrome({ logDir, executablePath }) {
  fs.mkdirSync(logDir, { recursive: true })
  const sentinel = `__DEOPT_BENCH_SENTINEL_${crypto.randomBytes(8).toString('hex')}__`
  const browser = await chromium.launch({
    headless: true,
    executablePath: findChromium(executablePath),
    args: ['--no-sandbox', `--js-flags=${v8LogFlags(logDir).join(' ')}`],
  })
  const context = await browser.newContext()
  // --log-source-code writes every compiled script's source into the log, so
  // a token evaluated in the page pinpoints the renderer isolate's log file.
  await context.addInitScript(`void function ${sentinel}() {}`)
  const page = await context.newPage()
  const version = browser.version()
  return { browser, context, page, sentinel, version }
}

/**
 * Pick the log written by the renderer isolate that ran our page: the one
 * containing the sentinel token. Falls back to the largest log if the
 * sentinel is missing (e.g. source logging disabled).
 */
export function selectRendererLog(logDir, sentinel) {
  const logs = fs
    .readdirSync(logDir)
    .filter((name) => name.endsWith('.log'))
    .map((name) => path.join(logDir, name))
  if (logs.length === 0) {
    throw new Error(`No V8 logs were written to ${logDir}`)
  }
  const matches = logs.filter((file) =>
    fs.readFileSync(file, 'utf8').includes(sentinel)
  )
  const pool = matches.length > 0 ? matches : logs
  pool.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)
  return { selected: pool[0], all: logs, sentinelFound: matches.length > 0 }
}
