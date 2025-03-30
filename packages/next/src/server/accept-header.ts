interface Selection {
  pos: number
  pref?: number
  q: number
  token: string
}

interface Options {
  prefixMatch?: boolean
  type: 'accept-language'
}

function parse(
  raw: string,
  preferences: readonly string[] | undefined,
  options: Options
) {
  const lowers = new Map<string, { orig: string; pos: number }>()
  const header = raw.replace(/[ \t]/g, '')

  if (preferences) {
    let pos = 0
    for (const preference of preferences) {
      const lower = preference.toLowerCase()
      lowers.set(lower, { orig: preference, pos: pos++ })
      if (options.prefixMatch) {
        const parts = lower.split('-')
        while ((parts.pop(), parts.length > 0)) {
          const joined = parts.join('-')
          if (!lowers.has(joined)) {
            lowers.set(joined, { orig: preference, pos: pos++ })
          }
        }
      }
    }
  }

  const parts = header.split(',')
  const selections: Selection[] = []
  const map = new Set<string>()

  for (let i = 0; i < parts.length; ++i) {
    const part = parts[i]
    if (!part) {
      continue
    }

    const params = part.split(';')
    if (params.length > 2) {
      throw new Error(`Invalid ${options.type} header`)
    }

    let token = params[0].toLowerCase()
    if (!token) {
      throw new Error(`Invalid ${options.type} header`)
    }

    const selection: Selection = { token, pos: i, q: 1 }
    if (preferences && lowers.has(token)) {
      selection.pref = lowers.get(token)!.pos
    }

    map.add(selection.token)

    if (params.length === 2) {
      const q = params[1]
      const [key, value] = q.split('=')

      if (!value || (key !== 'q' && key !== 'Q')) {
        throw new Error(`Invalid ${options.type} header`)
      }

      const score = parseFloat(value)
      if (score === 0) {
        continue
      }

      if (Number.isFinite(score) && score <= 1 && score >= 0.001) {
        selection.q = score
      }
    }

    selections.push(selection)
  }

  selections.sort((a, b) => {
    if (b.q !== a.q) {
      return b.q - a.q
    }

    if (b.pref !== a.pref) {
      if (a.pref === undefined) {
        return 1
      }

      if (b.pref === undefined) {
        return -1
      }

      return a.pref - b.pref
    }

    return a.pos - b.pos
  })

  const values = selections.map((selection) => selection.token)
  if (!preferences || !preferences.length) {
    return values
  }

  const preferred: string[] = []
  for (const selection of values) {
    if (selection === '*') {
      for (const [preference, value] of lowers) {
        if (!map.has(preference)) {
          preferred.push(value.orig)
        }
      }
    } else {
      const lower = selection.toLowerCase()
      if (lowers.has(lower)) {
        preferred.push(lowers.get(lower)!.orig)
      }
    }
  }

  return preferred
}

export function acceptLanguage(header = '', preferences?: readonly string[]) {
  return (
    parse(header, preferences, {
      type: 'accept-language',
      prefixMatch: true,
    })[0] || ''
  )
}
