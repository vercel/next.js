/**
 * Determines whether the project's browserslist targets need any of the
 * module-level polyfills shipped by `@next/polyfill-module`.
 *
 * Each entry maps a polyfill to the **minimum** browser versions that
 * support it natively (sourced from the inline comments in
 * `packages/next-polyfill-module/src/index.js`).
 *
 * If every resolved browser is at or above the minimum for every
 * polyfill, the caller can safely skip bundling the polyfill module —
 * saving ~14 KiB from the client bundle and silencing the Lighthouse
 * "Legacy JavaScript" audit.
 */

type BrowserFamily = 'chrome' | 'firefox' | 'safari' | 'edge'

// Minimum (major) version that supports each polyfill, per browser family.
// "0" means "never supported natively" — the polyfill is always needed
// for that browser family.
const POLYFILL_MIN_VERSIONS: Record<
  string,
  Partial<Record<BrowserFamily, number>>
> = {
  'string-trimstart': { chrome: 66, firefox: 61, safari: 12, edge: 79 },
  'string-trimend': { chrome: 66, firefox: 61, safari: 12, edge: 79 },
  'symbol-description': { chrome: 70, firefox: 63, safari: 12, edge: 79 },
  'array-flat': { chrome: 69, firefox: 62, safari: 12, edge: 79 },
  'array-flatmap': { chrome: 69, firefox: 62, safari: 12, edge: 79 },
  'promise-finally': { chrome: 63, firefox: 58, safari: 11, edge: 15 },
  'object-fromentries': { chrome: 73, firefox: 63, safari: 12, edge: 79 },
  'array-at': { chrome: 92, firefox: 90, safari: 15, edge: 92 },
  'object-hasown': { chrome: 93, firefox: 92, safari: 15, edge: 93 },
  'url-canparse': { chrome: 120, firefox: 115, safari: 17, edge: 120 },
}

/**
 * Parse a browserslist entry like `"chrome 131.0.0"` into
 * `{ family: "chrome", major: 131 }`.
 */
function parseBrowserslistEntry(
  entry: string
): { family: BrowserFamily; major: number } | null {
  // Browserslist output format: "family version"
  // e.g. "chrome 131.0.0", "firefox 133.0", "safari 18.2"
  const match = entry.match(
    /^(chrome|firefox|safari|edge)\s+(\d+)/i
  )
  if (!match) return null
  return {
    family: match[1].toLowerCase() as BrowserFamily,
    major: parseInt(match[2], 10),
  }
}

/**
 * Returns `true` when at least one polyfill is needed for the given
 * browserslist targets, `false` when all targets support the APIs
 * natively and the polyfill module can be skipped.
 */
export function needsPolyfill(supportedBrowsers: string[]): boolean {
  for (const entry of supportedBrowsers) {
    const parsed = parseBrowserslistEntry(entry)
    if (!parsed) {
      // Unrecognised browser — be safe and include polyfills.
      return true
    }

    for (const [, minVersions] of Object.entries(POLYFILL_MIN_VERSIONS)) {
      const minVersion = minVersions[parsed.family]
      if (minVersion === undefined) {
        // We don't track this browser family — be safe.
        return true
      }
      if (parsed.major < minVersion) {
        return true
      }
    }
  }

  return false
}
