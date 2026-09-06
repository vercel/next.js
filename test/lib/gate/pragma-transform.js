// @ts-check

/**
 * Source-to-source rewrite of `// @gate` / `// @force-gate` pragmas.
 *
 * ```
 * // @gate !cacheComponents
 * it('does a thing', async () => {})
 * ```
 *
 * becomes
 *
 * ```
 * // @gate !cacheComponents
 * _test_gate([{"force":false,"source":"!cacheComponents"}],"it")('does a thing', async () => {})
 * ```
 *
 * `_test_gate` is installed as a global by `test/lib/gate/runtime.ts` and
 * returns a curried `it`-alike, so the original `(name, fn, timeout)` arguments
 * flow through untouched.
 *
 * This is deliberately a regex rewrite and not an AST transform: the only
 * edited bytes are on the `it(` / `describe(` line itself, so the line numbers
 * of every other line are preserved exactly. That matters because Jest writes
 * `toMatchInlineSnapshot()` results back by line/column, and because stack
 * traces should still point at the original source.
 */

/**
 * A pragma block is one or more consecutive `// @gate` lines *immediately*
 * followed by an `it` / `test` / `fit` / `describe` call. Anything else (a
 * pragma in a JSDoc block, a pragma with a blank line under it, a pragma over
 * `it.each`) is not matched, and is reported as an error by `rewrite()` rather
 * than silently ignored.
 */
const PRAGMA_BLOCK =
  /((?:^[ \t]*\/\/[ \t]*@(?:force-)?gate\b[^\n]*\n)+)([ \t]*)(it|test|fit|describe)((?:\.only)?)([ \t]*\()/gm

/** Matches a single pragma line and captures `force` + the condition source. */
const PRAGMA_LINE = /^[ \t]*\/\/[ \t]*@(force-)?gate\b[ \t]*([^\n]*)$/

/** Cheap detector used to find pragmas the block regex did not consume. */
const PRAGMA_LINE_LOOSE = /^[ \t]*\/\/[ \t]*@(?:force-)?gate\b/

/**
 * A skipped (or todo) test call. A skip *without* a pragma flows through
 * untouched, but a pragma on one is ambiguous — should the gate re-enable the
 * test, or does the skip win? — so it gets a dedicated error instead of the
 * generic misplaced-pragma one.
 */
const SKIPPED_CALL =
  /^[ \t]*(?:xit|xtest|xdescribe|(?:it|test|describe)\.skip|(?:it|test)\.todo)[ \t]*[(.]/

/**
 * @param {string} src
 * @returns {number[]} 0-based index of the first character of each line
 */
function getLineStarts(src) {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1)
  }
  return starts
}

/**
 * @param {number[]} lineStarts
 * @param {number} offset
 * @returns {number} 1-based line number containing `offset`
 */
function getLineNumber(lineStarts, offset) {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (lineStarts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return low + 1
}

/**
 * Rewrites every `@gate` / `@force-gate` pragma block in `src`.
 *
 * Throws if the file contains a pragma-looking comment that would not have any
 * effect — a silently-inert gate is the worst possible failure mode for a
 * feature whose entire purpose is to not lie about coverage.
 *
 * @param {string} src
 * @param {string} [filename]
 * @returns {string}
 */
function rewrite(src, filename) {
  // Cheap bail-out for the ~2000 files with no pragma. `@force-gate` does not
  // contain the substring `@gate`, so both spellings have to be checked.
  if (!src.includes('@gate') && !src.includes('@force-gate')) return src

  const lineStarts = getLineStarts(src)
  /** @type {Set<number>} 1-based line numbers consumed by a match */
  const consumed = new Set()

  const output = src.replace(
    PRAGMA_BLOCK,
    /**
     * @param {string} _all
     * @param {string} pragmaLines
     * @param {string} indent
     * @param {string} callee
     * @param {string} only
     * @param {string} openParen
     * @param {number} offset
     */
    (_all, pragmaLines, indent, callee, only, openParen, offset) => {
      const firstLine = getLineNumber(lineStarts, offset)
      const gates = []
      const lines = pragmaLines.split('\n')
      // The trailing element is '' because `pragmaLines` ends with a newline.
      for (let i = 0; i < lines.length - 1; i++) {
        consumed.add(firstLine + i)
        const match = PRAGMA_LINE.exec(lines[i])
        if (!match) {
          // Not reachable: PRAGMA_BLOCK already matched these lines.
          throw new Error(`Unparsable @gate pragma: ${lines[i]}`)
        }
        const source = match[2].trim()
        if (!source) {
          throw new Error(
            `${describeLocation(filename, firstLine + i)}: \`@${
              match[1] ? 'force-gate' : 'gate'
            }\` needs a condition, e.g. \`// @gate !cacheComponents\`.`
          )
        }
        gates.push({ force: Boolean(match[1]), source })
      }

      return (
        pragmaLines +
        indent +
        `_test_gate(${JSON.stringify(gates)},${JSON.stringify(
          callee + only
        )})` +
        openParen
      )
    }
  )

  assertNoInertPragmas(src, consumed, filename)

  return output
}

/**
 * @param {string} src
 * @param {Set<number>} consumed
 * @param {string | undefined} filename
 */
function assertNoInertPragmas(src, consumed, filename) {
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!PRAGMA_LINE_LOOSE.test(lines[i])) continue
    if (consumed.has(i + 1)) continue

    // Walk past the rest of the pragma block to the line it tried to gate.
    let target = i + 1
    while (target < lines.length && PRAGMA_LINE_LOOSE.test(lines[target])) {
      target++
    }
    if (target < lines.length && SKIPPED_CALL.test(lines[target])) {
      throw new Error(
        `${describeLocation(filename, i + 1)}: a \`@gate\` pragma on a ` +
          `skipped test is ambiguous.\n\n` +
          `  ${lines[i].trim()}\n  ${lines[target].trim()}\n\n` +
          `Either remove the skip and let the gate decide (a false condition ` +
          `absorbs the failure), or keep the plain skip and remove the ` +
          `pragma.`
      )
    }

    throw new Error(
      `${describeLocation(filename, i + 1)}: this \`@gate\` pragma has no ` +
        `effect.\n\n` +
        `  ${lines[i].trim()}\n\n` +
        `A pragma must sit on the line(s) immediately above an ` +
        `\`it(\`, \`test(\`, \`fit(\`, \`describe(\`, \`it.only(\`, ` +
        `\`test.only(\` or \`describe.only(\` call — with no blank line in ` +
        `between. \`it.each\` and \`it.failing\` are not supported. If this ` +
        `comment is prose rather than a pragma, reword it so it does not ` +
        `start with \`@gate\`.`
    )
  }
}

/**
 * @param {string | undefined} filename
 * @param {number} line
 */
function describeLocation(filename, line) {
  return `${filename ?? '<unknown>'}:${line}`
}

module.exports = { rewrite }
