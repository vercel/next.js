export type NegotiatedType = 'html' | 'markdown' | 'plain'

type AcceptEntry = {
  type: string
  q: number
  index: number
  specificity: number
}

function parseAccept(header: string | null | undefined): AcceptEntry[] {
  if (!header) return []
  const entries: AcceptEntry[] = []
  const parts = header.split(',')
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i].trim()
    if (!raw) continue
    const [typePart, ...params] = raw.split(';').map((s) => s.trim())
    const type = typePart.toLowerCase()
    let q = 1
    for (const param of params) {
      const eq = param.indexOf('=')
      if (eq === -1) continue
      const name = param.slice(0, eq).trim().toLowerCase()
      const value = param.slice(eq + 1).trim()
      if (name === 'q') {
        const parsed = Number(value)
        if (!Number.isNaN(parsed)) {
          q = Math.max(0, Math.min(1, parsed))
        }
      }
    }
    const specificity = type === '*/*' ? 0 : type.endsWith('/*') ? 1 : 2
    entries.push({ type, q, index: i, specificity })
  }
  return entries
}

function matches(offered: string, accepted: string): boolean {
  if (accepted === '*/*') return true
  if (accepted.endsWith('/*')) {
    return offered.startsWith(accepted.slice(0, -1))
  }
  return offered === accepted
}

const OFFERED: Record<NegotiatedType, string> = {
  html: 'text/html',
  markdown: 'text/markdown',
  plain: 'text/plain',
}

/**
 * Pick the best representation among html / markdown / plain.
 * Returns null when the client listed types and rejected all of them (q=0).
 */
export function negotiateRepresentation(
  acceptHeader: string | null | undefined,
  available: NegotiatedType[]
): NegotiatedType | null {
  const entries = parseAccept(acceptHeader)
  if (entries.length === 0) {
    // No Accept: browsers omitted it historically; serve HTML.
    return available.includes('html') ? 'html' : (available[0] ?? null)
  }

  let best: {
    type: NegotiatedType
    q: number
    specificity: number
    index: number
  } | null = null

  for (const candidate of available) {
    const offered = OFFERED[candidate]
    for (const entry of entries) {
      if (!matches(offered, entry.type)) continue
      if (entry.q <= 0) continue
      if (
        !best ||
        entry.q > best.q ||
        (entry.q === best.q && entry.specificity > best.specificity) ||
        (entry.q === best.q &&
          entry.specificity === best.specificity &&
          entry.index < best.index)
      ) {
        best = {
          type: candidate,
          q: entry.q,
          specificity: entry.specificity,
          index: entry.index,
        }
      }
    }
  }

  if (best) return best.type

  // Client sent Accept but every available type is q=0 or unmatched.
  const listedNonWildcard = entries.some(
    (e) => e.type !== '*/*' && !e.type.endsWith('/*') && e.q > 0
  )
  if (listedNonWildcard) return null
  return available.includes('html') ? 'html' : (available[0] ?? null)
}

export function appendVary(
  existing: string | string[] | undefined,
  token: string
): string {
  const parts = (Array.isArray(existing) ? existing.join(',') : existing || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.some((p) => p.toLowerCase() === token.toLowerCase())) {
    parts.push(token)
  }
  return parts.join(', ')
}
