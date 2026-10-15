import type { TestArtifactLocation } from '../runner/tasks'
/*!
 * The source-excerpt formatting is adapted from Vitest.
 * https://github.com/vitest-dev/vitest/blob/0780a8e5b7967a4168173599e9c74fb79aab2483/packages/vitest/src/node/printError.ts
 *
 * MIT License
 *
 * Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import type { SnapshotStateOptions } from '../../../compiled/next-test-primitives'
import { getSourceMappedStackFrames } from '../../../server/patch-error-inspect'
import { serializeDiagnostic, type DiagnosticOptions } from './diagnostics'
import type { SerializedDiagnostic } from './events'

function sourceExcerpt(
  source: string | null,
  line: number | null,
  column: number | null
): string | undefined {
  // Avoid retaining or expanding large/minified sources in worker messages.
  if (
    source === null ||
    source.length > 100_000 ||
    line === null ||
    column === null ||
    !Number.isSafeInteger(line) ||
    !Number.isSafeInteger(column) ||
    line < 1 ||
    column < 1
  ) {
    return
  }
  const lines = source.split(/\r?\n/)
  if (line > lines.length || column > lines[line - 1].length + 1) return
  const excerpt: string[] = []
  for (
    let index = Math.max(0, line - 3);
    index < Math.min(lines.length, line + 2);
    index++
  ) {
    if (lines[index].length > 200) return
    const content = lines[index].replace(/\t/g, ' ').trimEnd()
    if (content.startsWith('//# sourceMappingURL')) continue
    excerpt.push(
      `    ${String(index + 1).padStart(3)}|${content ? ` ${content}` : ''}`
    )
    if (index === line - 1) {
      excerpt.push(`       |${' '.repeat(column)}^`)
    }
  }
  return excerpt.join('\n') || undefined
}

/** Call in the execution realm while its artifact source maps are still leased. */
export function serializeSourceMappedDiagnostic(
  error: unknown,
  options: Omit<DiagnosticOptions, 'mapStack'>
): SerializedDiagnostic {
  return serializeDiagnostic(error, {
    ...options,
    mapStack(stack) {
      let capturedExcerpt = false
      return getSourceMappedStackFrames(stack, {
        includeSourceContent: true,
      }).flatMap((frame) => {
        if (frame.file === null) return []
        let codeFrame: string | undefined
        if (!capturedExcerpt && frame.getSourceContent) {
          try {
            codeFrame = sourceExcerpt(
              frame.getSourceContent(),
              frame.line1,
              frame.column1
            )
            capturedExcerpt = codeFrame !== undefined
          } catch {
            // Missing or invalid source content must not replace the error.
          }
        }
        return [
          {
            file: frame.file,
            line: frame.line1 ?? undefined,
            column: frame.column1 ?? undefined,
            methodName: frame.methodName,
            original: frame.original,
            ignored: frame.ignored,
            ...(codeFrame === undefined ? {} : { codeFrame }),
          },
        ]
      })
    },
  })
}

/** Inline edits use the same immutable artifact maps as failure reporting. */
export const mapSnapshotLocation: NonNullable<
  SnapshotStateOptions['snapshotEnvironment']['processStackTrace']
> = (stack) => {
  const [frame] = getSourceMappedStackFrames(
    `Error\n    at ${stack.method || '<anonymous>'} (${stack.file}:${stack.line}:${stack.column})`
  )
  if (!frame?.original || !frame.file || !frame.line1 || !frame.column1) {
    throw new Error(
      'Inline snapshots require an original source location from the compiled test artifact.'
    )
  }
  return {
    method: frame.methodName ?? stack.method,
    file: frame.file.startsWith('file:')
      ? fileURLToPath(frame.file)
      : resolve(frame.file),
    line: frame.line1,
    column: frame.column1,
  }
}

/** Annotation locations refer to the same immutable user-source revision as errors. */
export function mapTestAnnotationLocation(
  error: Error,
  testPath: string
): TestArtifactLocation | undefined {
  if (!error.stack) return
  const frame = getSourceMappedStackFrames(error.stack).find((candidate) => {
    if (
      !candidate.original ||
      !candidate.file ||
      !candidate.line1 ||
      !candidate.column1
    )
      return false
    const file = candidate.file.startsWith('file:')
      ? fileURLToPath(candidate.file)
      : resolve(candidate.file)
    return file === resolve(testPath)
  })
  if (!frame?.file || !frame.line1 || !frame.column1) return
  return {
    file: frame.file.startsWith('file:')
      ? fileURLToPath(frame.file)
      : resolve(frame.file),
    line: frame.line1,
    column: frame.column1,
  }
}
