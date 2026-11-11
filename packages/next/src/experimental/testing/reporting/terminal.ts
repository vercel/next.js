import { stripVTControlCharacters } from 'node:util'

export interface TestTerminalOptions {
  write: (text: string) => void
  writeError?: (text: string) => void
  isTTY?: boolean
  columns?: number | (() => number)
  rows?: number | (() => number)
}

export type TestTerminal = ReturnType<typeof createTestTerminal>

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function width(text: string): number {
  if (/^[\p{Mark}\u200d\ufe0f]+$/u.test(text)) return 0
  const point = text.codePointAt(0)!
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text) ||
    (point >= 0x1100 &&
      (point <= 0x115f ||
        (point >= 0x2e80 && point <= 0xa4cf) ||
        (point >= 0xac00 && point <= 0xd7a3) ||
        (point >= 0xf900 && point <= 0xfaff) ||
        (point >= 0xfe10 && point <= 0xfe6f) ||
        (point >= 0xff01 && point <= 0xff60) ||
        (point >= 0xffe0 && point <= 0xffe6) ||
        point >= 0x20000))
    ? 2
    : 1
}

function dimension(value: TestTerminalOptions['columns'], fallback: number) {
  const size = typeof value === 'function' ? value() : value
  return Number.isFinite(size) ? Math.max(2, Math.floor(size!)) : fallback
}

/** A single parent-owned display shared by progress, child output and prompts. */
export function createTestTerminal(options: TestTerminalOptions) {
  let lines: string[] = []
  let drawnWidths: number[] = []
  let suspended = 0
  let disposed = false
  let partial = false
  let hidden = false
  const columns = () => dimension(options.columns, 80)

  function clear() {
    if (!drawnWidths.length) return
    // Account for terminal reflow when its width changed since the last draw.
    const rows = drawnWidths.reduce(
      (sum, length) => sum + Math.max(1, Math.ceil(length / columns())),
      0
    )
    drawnWidths = []
    options.write(`\x1b[${rows}A\r\x1b[0J`)
  }

  function showCursor() {
    if (!hidden) return
    hidden = false
    options.write('\x1b[?25h')
  }

  function draw() {
    if (!options.isTTY || disposed) return
    if (!lines.length) {
      clear()
      showCursor()
      return
    }
    if (suspended || partial) return
    clear()
    const limit = columns() - 1
    const output: string[] = []
    const widths: number[] = []
    for (const line of lines.slice(0, dimension(options.rows, 24) - 1)) {
      let clipped = ''
      let length = 0
      const clean = stripVTControlCharacters(line).replace(/[\r\n\t]/g, ' ')
      for (const { segment } of segmenter.segment(clean)) {
        const size = width(segment)
        if (length + size > limit) break
        clipped += segment
        length += size
      }
      output.push(clipped)
      widths.push(length)
    }
    hidden = true
    options.write(`\x1b[?25l${output.join('\n')}\n`)
    drawnWidths = widths
  }

  function dispose() {
    if (disposed) return
    disposed = true
    lines = []
    try {
      clear()
    } finally {
      showCursor()
    }
  }

  function guarded(operation: () => void) {
    try {
      operation()
    } catch (error) {
      try {
        dispose()
      } catch {
        // Preserve the original writer error if cursor restoration also fails.
      }
      throw error
    }
  }

  return {
    render(next: string[]) {
      guarded(() => {
        lines = next
        draw()
      })
    },
    write(text: string, stream: 'stdout' | 'stderr' = 'stdout') {
      guarded(() => {
        clear()
        ;(stream === 'stderr'
          ? (options.writeError ?? options.write)
          : options.write)(text)
        if (text) partial = !text.endsWith('\n')
        if (partial) showCursor()
        draw()
      })
    },
    suspend() {
      guarded(() => {
        suspended++
        clear()
        showCursor()
      })
    },
    resume() {
      guarded(() => {
        suspended = Math.max(0, suspended - 1)
        draw()
      })
    },
    dispose,
  }
}
