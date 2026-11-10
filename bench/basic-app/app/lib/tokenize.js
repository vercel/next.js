// Minimal deterministic tokenizer for the docs fixture's code blocks.
// Produces the span-per-token structure a real syntax highlighter emits,
// which is where the deep element nesting in real docs payloads comes from.
const KEYWORDS = new Set([
  'import',
  'export',
  'default',
  'function',
  'return',
  'const',
  'let',
  'if',
  'else',
  'from',
  'new',
  'typeof',
  'null',
  'true',
  'false',
  'async',
  'await',
])

export function tokenize(code) {
  return code.split('\n').map((line) => {
    const tokens = []
    let rest = line
    while (rest.length > 0) {
      let m
      if ((m = rest.match(/^\/\/.*$/))) {
        tokens.push({ t: 'cm', s: m[0] })
      } else if ((m = rest.match(/^'[^']*'|^"[^"]*"|^`[^`]*`/))) {
        tokens.push({ t: 'str', s: m[0] })
      } else if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
        tokens.push({
          t: KEYWORDS.has(m[0]) ? 'kw' : /^[A-Z]/.test(m[0]) ? 'cls' : 'id',
          s: m[0],
        })
      } else if ((m = rest.match(/^\d[\d._]*/))) {
        tokens.push({ t: 'num', s: m[0] })
      } else if ((m = rest.match(/^[{}()[\].,;:<>=+\-*/!?&|]+/))) {
        tokens.push({ t: 'pn', s: m[0] })
      } else if ((m = rest.match(/^\s+/))) {
        tokens.push({ t: 'ws', s: m[0] })
      } else {
        tokens.push({ t: 'pl', s: rest[0] })
        rest = rest.slice(1)
        continue
      }
      rest = rest.slice(m[0].length)
    }
    return tokens.length ? tokens : [{ t: 'ws', s: '' }]
  })
}
