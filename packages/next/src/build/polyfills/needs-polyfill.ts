/**
 * Determines whether the project's browserslist targets need any of the
 * module-level polyfills shipped by `@next/polyfill-module`.
 *
 * Each entry maps a polyfill to the minimum browser versions that
 * support it natively.
 *
 * If every resolved browser is at or above the minimum for every
 * polyfill, the caller can safely skip bundling the polyfill module,
 * saving ~14 KiB from the client bundle and silencing the Lighthouse
 * "Legacy JavaScript" audit.
 */

type BrowserFamily =
  | 'chrome'
  | 'firefox'
  | 'safari'
  | 'edge'
  | 'opera'
  | 'samsung'

// Minimum (major) version that supports each polyfill, per browser family.
const POLYFILL_MIN_VERSIONS: Record<
  string,
  Partial<Record<BrowserFamily, number>>
> = {
  'string-trimstart': { chrome: 66, firefox: 61, safari: 12, edge: 79, opera: 53, samsung: 9.2 },
  'string-trimend': { chrome: 66, firefox: 61, safari: 12, edge: 79, opera: 53, samsung: 9.2 },
  'symbol-description': { chrome: 70, firefox: 63, safari: 12.1, edge: 79, opera: 57, samsung: 10.1 },
  'array-flat': { chrome: 69, firefox: 62, safari: 12, edge: 79, opera: 56, samsung: 10.1 },
  'array-flatmap': { chrome: 69, firefox: 62, safari: 12, edge: 79, opera: 56, samsung: 10.1 },
  'promise-finally': { chrome: 63, firefox: 58, safari: 11.1, edge: 18, opera: 50, samsung: 8.2 },
  'object-fromentries': { chrome: 73, firefox: 63, safari: 12.1, edge: 79, opera: 60, samsung: 11.1 },
  'array-at': { chrome: 92, firefox: 90, safari: 15.4, edge: 92, opera: 78, samsung: 16.0 },
  'object-hasown': { chrome: 93, firefox: 92, safari: 15.4, edge: 93, opera: 79, samsung: 17.0 },
  'url-canparse': { chrome: 120, firefox: 115, safari: 17.0, edge: 120, opera: 106, samsung: 25.0 },
}

// Map alias / mobile / derivative browser families to canonical engine families:
// - and_chr, chromeandroid, brave, arc, vivaldi -> chrome (Chromium engine)
// - and_ff, zen -> firefox (Gecko engine)
// - ios_saf -> safari (WebKit engine)
// - op_mob -> opera
function normalizeBrowserFamily(rawFamily: string): BrowserFamily | null {
  const f = rawFamily.toLowerCase()
  if (
    f === 'chrome' ||
    f === 'and_chr' ||
    f === 'chromeandroid' ||
    f === 'brave' ||
    f === 'arc' ||
    f === 'vivaldi'
  ) {
    return 'chrome'
  }
  if (f === 'firefox' || f === 'and_ff' || f === 'zen') {
    return 'firefox'
  }
  if (f === 'safari' || f === 'ios_saf') {
    return 'safari'
  }
  if (f === 'edge') {
    return 'edge'
  }
  if (f === 'opera' || f === 'op_mob') {
    return 'opera'
  }
  if (f === 'samsung') {
    return 'samsung'
  }
  return null
}

function parseBrowserslistEntry(
  entry: string
): { family: BrowserFamily; major: number } | null {
  const match = entry.match(/^([a-z_]+)\s+(\d+(\.\d+)?)/i)
  if (!match) return null
  const family = normalizeBrowserFamily(match[1])
  if (!family) return null
  return {
    family,
    major: parseFloat(match[2]),
  }
}

export function needsPolyfill(
  supportedBrowsers: string[] | undefined
): boolean {
  if (!supportedBrowsers || supportedBrowsers.length === 0) {
    return true
  }

  for (const entry of supportedBrowsers) {
    const parsed = parseBrowserslistEntry(entry)
    if (!parsed) {
      // Unrecognized or legacy browser family (IE, Opera, etc.) - be safe and include polyfills
      return true
    }

    for (const [, minVersions] of Object.entries(POLYFILL_MIN_VERSIONS)) {
      const minVersion = minVersions[parsed.family]
      if (minVersion === undefined || parsed.major < minVersion) {
        return true
      }
    }
  }

  return false
}
