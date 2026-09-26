/**
 * Minimal, dependency-free parsing of the V8 log events we treat as
 * authoritative signal. Deliberately covers only:
 *
 *   code-creation,JS  — code address -> function name/position (for
 *                       attributing deopts to their enclosing function)
 *   code-move         — keeps the address map correct across GC moves
 *   code-deopt        — the deoptimization events themselves
 *
 * IC (inline cache) analysis requires resolving program counters through the
 * full profile, which `v8-deopt-parser` already implements; see report.mjs.
 * That dependency is best-effort — this file is not.
 */

const CODE_CREATION_JS =
  /^code-creation,JS,\d+,\d+,(0x[0-9a-f]+),\d+,(.*?) ((?:[a-z][a-z0-9+.-]*:|\/|extensions::)\S*?):(\d+):(\d+),(0x[0-9a-f]+|),(.*)$/
const CODE_MOVE = /^code-move,(0x[0-9a-f]+),(0x[0-9a-f]+)/
// The position field may be an inlining chain: `<a> inlined at <b> inlined
// at <c>`. The first position is the innermost frame — where the deopt
// actually happened — so that's what findings are attributed to.
const CODE_DEOPT =
  /^code-deopt,(\d+),\d+,(0x[0-9a-f]+),(-?\d+),\d+,([a-z-]+),<(.*?)>(?: inlined at <[^>]*>)*,(.*)$/
const POSITION = /^(.*):(\d+):(\d+)$/

export function parseV8DeoptLog(logText) {
  /** @type {Map<string, {name: string, url: string, line: number, column: number}>} */
  const codeByAddr = new Map()
  /** @type {Map<string, object>} deduped deopt sites */
  const deopts = new Map()

  for (const line of logText.split('\n')) {
    if (line.startsWith('code-creation,JS,')) {
      const m = CODE_CREATION_JS.exec(line)
      if (m) {
        const [, addr, name, url, lineNo, colNo] = m
        codeByAddr.set(addr, {
          name: name.trim(),
          url,
          line: Number(lineNo),
          column: Number(colNo),
        })
      }
    } else if (line.startsWith('code-move,')) {
      const m = CODE_MOVE.exec(line)
      if (m) {
        const entry = codeByAddr.get(m[1])
        if (entry) {
          codeByAddr.delete(m[1])
          codeByAddr.set(m[2], entry)
        }
      }
    } else if (line.startsWith('code-deopt,')) {
      const m = CODE_DEOPT.exec(line)
      if (!m) continue
      const [, time, addr, , bailoutType, rawPosition, reason] = m
      const posMatch = POSITION.exec(rawPosition)
      const url = posMatch ? posMatch[1] : null
      const lineNo = posMatch ? Number(posMatch[2]) : null
      const colNo = posMatch ? Number(posMatch[3]) : null
      const fn = codeByAddr.get(addr) ?? null
      const key = `${bailoutType}|${url}|${lineNo}|${colNo}|${reason}`
      const existing = deopts.get(key)
      if (existing) {
        existing.count++
        if (!existing.functionName && fn?.name) existing.functionName = fn.name
      } else {
        deopts.set(key, {
          kind: 'deopt',
          bailoutType,
          reason,
          url,
          line: lineNo,
          column: colNo,
          functionName: fn?.name || null,
          functionUrl: fn?.url ?? null,
          functionLine: fn?.line ?? null,
          functionColumn: fn?.column ?? null,
          count: 1,
          firstTimestamp: Number(time),
        })
      }
    }
  }

  return [...deopts.values()]
}
