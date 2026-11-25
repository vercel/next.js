import fs from 'fs'
import path from 'path'

// Resolve against this copy of the CLI, including in a hoisted installation.
const docsDir = path.join(__dirname, '../docs')
const stopWords = new Set(
  'a about after all an and are as at be before by can do does for from how i if in into is it its my of on or our should so some than that the their then there these this to what when which while will with without you your'.split(
    ' '
  )
)

type Section = {
  id: string
  file: string
  title: string
  heading: string
  parents: string[]
  description: string
  start: number
  text: string
}

function terms(text: string): string[] {
  const identifiers = text.match(/\b[a-z]+(?:[A-Z][A-Za-z0-9]*)+/g) || []
  const words = [
    ...(text.toLowerCase().match(/[a-z0-9]+/g) || []),
    ...identifiers.flatMap((s) =>
      s
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(' ')
    ),
  ]
  return words
    .filter((s) => s.length > 1 && !stopWords.has(s))
    .map((s) => {
      if (s.length > 5 && s.endsWith('ies')) return s.slice(0, -3) + 'y'
      if (s.length > 4 && s.endsWith('s') && !s.endsWith('ss'))
        return s.slice(0, -1)
      return s
    })
}

function* markdownFiles(dir = ''): Generator<string> {
  for (const entry of fs.readdirSync(path.join(docsDir, dir), {
    withFileTypes: true,
  })) {
    const file = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) yield* markdownFiles(file)
    else if (entry.isFile() && file.endsWith('.md')) yield file
  }
}

function plain(line: string) {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_]/g, '')
    .trim()
}

function sections(file: string): Section[] {
  const lines = fs.readFileSync(path.join(docsDir, file), 'utf8').split(/\r?\n/)
  const frontmatterEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  const meta = lines.slice(1, frontmatterEnd + 1)
  const field = (key: string) =>
    meta
      .find((s) => s.startsWith(key + ': '))
      ?.slice(key.length + 2)
      .replace(/^["']|["']$/g, '')
  const title = field('title') || path.basename(file, '.md')
  const cuts = [
    {
      start: frontmatterEnd + 1,
      heading: title,
      id: file,
      parents: [] as string[],
    },
  ]
  const stack: { level: number; heading: string }[] = []
  const counts = new Map<string, number>()
  let fence = ''
  for (let i = frontmatterEnd + 1; i < lines.length; i++) {
    const line = lines[i]
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = ''
      continue
    }
    const h = !fence && /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (!h) continue
    const heading = plain(h[2])
    const slug = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
    if (!slug) continue
    const n = counts.get(slug) || 0
    counts.set(slug, n + 1)
    while (stack.length && stack[stack.length - 1].level >= h[1].length)
      stack.pop()
    cuts.push({
      start: i,
      heading,
      id: file + '#' + slug + (n ? '-' + n : ''),
      parents: stack.map((v) => v.heading),
    })
    stack.push({ level: h[1].length, heading })
  }
  const result: Section[] = []
  for (const [j, c] of cuts.entries()) {
    const text = lines
      .slice(c.start, cuts[j + 1]?.start ?? lines.length)
      .join('\n')
      .trimEnd()
    if (!text.replace(/^#{1,6}\s+.*$/gm, '').trim()) continue
    const first = text
      .split('\n')
      .map(plain)
      .find(
        (s) => s.length > 35 && !/^(#|>|import |export |\/\/|\||\{|\})/.test(s)
      )
    result.push({
      ...c,
      file,
      title,
      text,
      start: c.start + 1,
      description: (first || field('description') || c.heading).slice(0, 165),
    })
  }
  return result
}

export function searchDocs(query: string[]) {
  const wanted = [...new Set(terms(query.join(' ')))]
  if (!wanted.length) {
    console.log('[]')
    return
  }
  const hasDir = (name: string) =>
    [name, path.join('src', name)].some((p) => fs.existsSync(p))
  const appOnly = hasDir('app') && !hasDir('pages')
  const documentFrequency = new Map<string, number>()
  const candidates = []
  let totalLength = 0
  for (const file of markdownFiles()) {
    if (appOnly && file.startsWith('02-pages/')) continue
    for (const s of sections(file)) {
      const frequencies = new Map<string, number>()
      let length = 0
      const add = (text: string, weight: number) => {
        for (const t of terms(text)) {
          length += weight
          if (wanted.includes(t))
            frequencies.set(t, (frequencies.get(t) || 0) + weight)
        }
      }
      add(s.text.slice(0, 9000), 1)
      add(s.title, 4)
      add(s.heading, 8)
      add(s.parents.join(' '), 2)
      add(path.basename(file, '.md'), 5)
      totalLength += length
      for (const t of frequencies.keys())
        documentFrequency.set(t, (documentFrequency.get(t) || 0) + 1)
      candidates.push({
        id: s.id,
        description: s.heading + ' — ' + s.description,
        file,
        length,
        frequencies,
      })
    }
  }
  // BM25: favor distinctive terms without letting long sections dominate. Include
  // missing words in query coverage so weak partial matches can return no results.
  const idf = (t: string) =>
    Math.log(
      1 +
        (candidates.length - (documentFrequency.get(t) || 0) + 0.5) /
          ((documentFrequency.get(t) || 0) + 0.5)
    )
  const weights = wanted.map(idf)
  const queryWeight = weights.reduce((a, b) => a + b, 0)
  const average = totalLength / candidates.length
  const ranked = []
  for (const c of candidates) {
    let score = 0,
      matchedWeight = 0
    if (c.frequencies.size < Math.min(2, wanted.length)) continue
    for (const [i, t] of wanted.entries()) {
      const f = c.frequencies.get(t)
      if (!f) continue
      score +=
        (weights[i] * f * 2.2) /
        (f + 1.2 * (0.45 + (0.55 * c.length) / average))
      matchedWeight += weights[i]
    }
    if (matchedWeight >= queryWeight * 0.55)
      ranked.push({ id: c.id, description: c.description, file: c.file, score })
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  const byFile = new Map<string, number>()
  const output = []
  for (const { id, description, file } of ranked) {
    const count = byFile.get(file) || 0
    if (count >= 2) continue
    byFile.set(file, count + 1)
    output.push({ id, description })
    if (output.length === 3) break
  }
  console.log(JSON.stringify(output, null, 2))
}

export function retrieveDocs(id: string, line?: string) {
  const file = id.split('#', 1)[0]
  // IDs are opaque: only open files enumerated from the installed docs.
  if (!Array.from(markdownFiles()).includes(file)) {
    console.error(
      'Unknown documentation ID. Use an ID returned by next docs search.'
    )
    process.exitCode = 1
    return
  }
  const section = sections(file).find((s) => s.id === id)
  if (!section) {
    console.error(
      'Unknown documentation section. Use an ID returned by next docs search.'
    )
    process.exitCode = 1
    return
  }
  const lines = section.text.split('\n')
  const offset = line === undefined ? 0 : Number(line) - section.start
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= lines.length) {
    console.error('The requested line is outside this section.')
    process.exitCode = 1
    return
  }
  let end = offset,
    bytes = 0
  while (end < lines.length) {
    const size = Buffer.byteLength(lines[end]) + 1
    if (end > offset && bytes + size > 7000) break
    bytes += size
    end++
  }
  console.log(
    file +
      ':' +
      (section.start + offset) +
      '-' +
      (section.start + end - 1) +
      '\n\n' +
      lines.slice(offset, end).join('\n')
  )
  if (end < lines.length)
    console.log(
      'Continue with line ' + (section.start + end) + ' of this section.'
    )
}
