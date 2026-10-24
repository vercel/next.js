/**
 * One URL path part of the current page. A string is the concrete part —
 * whether it came from a static route segment or a dynamic param makes no
 * difference to relative path resolution. Null means the part's value is not
 * known: a fallback param during a static prerender. Null never occurs on the
 * client, where param values are always filled in from the actual URL.
 */
export type BaseUrlPart = string | null

/**
 * Whether a route pattern segment is dynamic ('[id]') rather than static
 * text. This is the only pattern check the matcher makes: catch-all
 * ('[...slug]') and optional catch-all ('[[...slug]]') segments aren't
 * supported as targets — they span an unknown number of URL parts — but
 * they're not distinguished here; they get the same one-part treatment as
 * any other dynamic segment, and a development-only warning is emitted
 * below.
 */
function isDynamicPatternSegment(segment: string): boolean {
  return segment.startsWith('[') && segment.endsWith(']')
}

/**
 * Whether a route pattern segment is a catch-all ('[...slug]') or optional
 * catch-all ('[[...slug]]') pattern. Only used for development warnings —
 * production treats these like any other dynamic segment.
 */
function isCatchAllPatternSegment(segment: string): boolean {
  return segment.startsWith('[...') || segment.startsWith('[[')
}

/**
 * Development-only. A catch-all pattern in the target is a mistake under
 * every param value — it spans an unknown number of URL parts, so it can't
 * participate in positional matching — which is why, unlike the
 * unresolved-segment warning, this one is never suppressed.
 */
function warnCatchAllPatternTarget(target: string, segment: string): void {
  console.error(
    `unstable_useRelativeHref('${target}') does not support catch-all ` +
      `segment patterns (${segment}) in the target. Spell out the concrete ` +
      `path parts instead.`
  )
}

/**
 * Splits a URL path or route pattern into its segments, ignoring leading and
 * trailing slashes. The root ('/') has zero segments. Segment text is
 * treated literally — no decoding or validation.
 */
export function splitPathSegments(path: string): string[] {
  let start = 0
  let end = path.length
  while (start < end && path[start] === '/') start++
  while (end > start && path[end - 1] === '/') end--
  const trimmed = path.slice(start, end)
  return trimmed === '' ? [] : trimmed.split('/')
}

/**
 * Computes a relative URL reference from the current page to a target route
 * pattern, for `unstable_useRelativeHref`.
 *
 * The current page's URL path is given as `baseRoute` — one part per entry,
 * excluding basePath. The caller derives it either from the route structure
 * (the statically resolvable matched route, see `getMatchedRoute`) or by
 * splitting the actual URL pathname, and passes null when neither yields a
 * usable base: a fallback-shell prerender of a route with no statically
 * resolvable path, where the pathname is a placeholder rather than a real
 * URL.
 *
 * Returns null when the href would read values that don't exist yet: the
 * value of an unknown (null) base part, or any base at all when `baseRoute`
 * is null. This only ever happens while prerendering a fallback shell; the
 * caller must deopt to dynamic rendering, and the href is recomputed at
 * request time when the values exist. Hrefs that are invariant to the
 * unknown values (e.g. the target diverges from the current route before
 * reaching an unknown part) still come out as strings and can stay in the
 * static shell.
 *
 * The result resolves (against the current page's URL) to the target's URL
 * path, with dynamic segments filled from the current page where the target
 * matches it. Its path portion always ends in '/', so appending a child
 * segment to the result always yields a child of the target. A query and/or
 * hash in the target is preserved: it's carried over to the result
 * verbatim, after the trailing slash.
 *
 * Target segments are matched against base parts positionally: a dynamic
 * segment ('[id]') matches any one part — the target is saying it doesn't
 * care which value it matches — and static text matches an equal concrete
 * part. Target strings are assumed to be valid paths in the app's route
 * space (validated via the typed `Route` utility), so no further validation
 * happens here — including of catch-all patterns, which aren't supported as
 * targets but are treated like any other dynamic segment.
 *
 * A dynamic segment in the target with no value available is left as
 * literal pattern text in the href; this function never throws. Development
 * warnings for that case and for catch-all targets are emitted inline, in
 * the branches that detect them.
 *
 * Only a root-relative target ('/...') is treated as a route pattern.
 * Anything else is returned verbatim — an absolute URL ('https://…',
 * 'mailto:…'), a protocol-relative URL ('//host/…'), a hash- or query-only
 * reference ('#faq', '?tab=1'), or an already-relative reference. The hook's
 * contract is that `<Link href={useRelativeHref(x)}>` behaves identically to
 * `<Link href={x}>` except for the impact on static prerendering, and those
 * references already mean the right thing untouched. A verbatim result
 * never reads the base, so it's returned even when `baseRoute` is null.
 */
export function computeRelativeHref(
  target: string,
  baseRoute: readonly BaseUrlPart[] | null,
  trailingSlash: boolean
): string | null {
  // Non-root-relative targets pass through verbatim (see above). '//' is a
  // protocol-relative URL, not a path.
  if (target[0] !== '/' || target[1] === '/') {
    return target
  }

  if (baseRoute === null) {
    // No usable base this render (see above): every root-relative href
    // depends on values that only exist at request time.
    return null
  }

  // Split off the target's query and hash — everything from the first '?'
  // or '#' — to be carried over to the result verbatim. Only the path part
  // participates in matching.
  let suffixStart = target.indexOf('?')
  const hashStart = target.indexOf('#')
  if (hashStart !== -1 && (suffixStart === -1 || hashStart < suffixStart)) {
    suffixStart = hashStart
  }
  const suffix = suffixStart === -1 ? '' : target.slice(suffixStart)
  const targetPath = suffixStart === -1 ? target : target.slice(0, suffixStart)

  const targetSegments = splitPathSegments(targetPath)
  const baseParts: readonly BaseUrlPart[] = baseRoute

  // The URL depth of the current page.
  const pageDepth = baseParts.length

  // Relative URL resolution drops the base URL's final segment, unless the
  // URL ends in a slash (i.e. `trailingSlash: true`).
  const baseDepth = trailingSlash ? pageDepth : Math.max(0, pageDepth - 1)

  // Find the shared prefix between the target's pattern segments and the
  // current page's URL parts.
  let shared = 0
  while (shared < targetSegments.length && shared < pageDepth) {
    const targetSegment = targetSegments[shared]
    if (isDynamicPatternSegment(targetSegment)) {
      // '[id]' matches any one URL part, known or unknown.
      if (
        process.env.NODE_ENV !== 'production' &&
        isCatchAllPatternSegment(targetSegment)
      ) {
        warnCatchAllPatternTarget(target, targetSegment)
      }
    } else if (baseParts[shared] === null) {
      // A concrete target segment compared against an unknown part: whether
      // they match can't be known statically, and the two outcomes produce
      // different hrefs.
      return null
    } else if (targetSegment !== baseParts[shared]) {
      break
    }
    shared++
  }

  // The shared prefix can extend past the resolution base (e.g. the target is
  // the page's own route); only the portion within the base is expressed as
  // traversal. The rest must be spelled back out.
  const effectiveShared = Math.min(shared, baseDepth)
  const ups = baseDepth - effectiveShared

  // Spell out the concrete URL parts of the current page between the
  // resolution base and the end of the shared prefix. This covers the
  // own-route and descendant cases, where the page's final segment(s) must be
  // spelled back out because relative resolution drops them. An unknown part
  // here means the href needs a value that doesn't exist yet.
  const spelled: string[] = []
  for (let i = effectiveShared; i < shared; i++) {
    const part = baseParts[i]
    if (part === null) {
      return null
    }
    spelled.push(part)
  }

  // Spell out the target's pattern segments past the shared prefix. Static
  // text is emitted as-is. A dynamic segment here has no value available, so
  // its literal pattern text is emitted (technically a valid URL segment).
  // The warning never fires on a render that's about to deopt — resolution
  // stops (returns null) at the first unknown value, before reaching here —
  // so it only reports genuine mismatches, on renders whose result is
  // actually used.
  for (let i = shared; i < targetSegments.length; i++) {
    const segment = targetSegments[i]
    if (
      process.env.NODE_ENV !== 'production' &&
      isDynamicPatternSegment(segment)
    ) {
      if (isCatchAllPatternSegment(segment)) {
        warnCatchAllPatternTarget(target, segment)
      } else {
        console.error(
          `unstable_useRelativeHref('${target}') could not resolve the dynamic ` +
            `segment(s) ${segment} because it doesn't lie on the current ` +
            `route. The literal segment text was left in the result, which ` +
            `is almost certainly a mistake.`
        )
      }
    }
    spelled.push(segment)
  }

  let href = ups > 0 ? '../'.repeat(ups) : './'
  for (const segment of spelled) {
    href += segment + '/'
  }
  href += suffix

  return href
}
