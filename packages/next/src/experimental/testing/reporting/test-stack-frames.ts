import { parseStack } from '../../../server/lib/parse-stack'
import { getSourceMappedStackFrames } from '../../../server/patch-error-inspect'
import type { ArtifactOriginalSource } from '../execution/source-maps'

type Frame = ReturnType<typeof getSourceMappedStackFrames>[number]
type RawFrame = ReturnType<typeof parseStack>[number]
type FrameOptions = Parameters<typeof getSourceMappedStackFrames>[1]
export type TestStackFrame =
  | { kind: 'mapped' | 'generated'; frame: Frame }
  | { kind: 'authored'; frame: RawFrame; source: ArtifactOriginalSource }

const BUNDLER_FIND_SOURCE_MAP = Symbol.for('next.dev.bundlerFindSourceMap')
type ArtifactMapGlobal = typeof globalThis & {
  [BUNDLER_FIND_SOURCE_MAP]?: {
    originalSource?(file: string): ArtifactOriginalSource | undefined
  }
}

function retainedAuthoredFrame(
  frame: RawFrame
): ArtifactOriginalSource | undefined {
  if (!frame.file || !frame.line1 || !frame.column1) return
  try {
    const source = (globalThis as ArtifactMapGlobal)[
      BUNDLER_FIND_SOURCE_MAP
    ]?.originalSource?.(frame.file)
    if (!source) return
    const lines = source.content.split(/\r\n|[\n\r\u2028\u2029]/)
    if (
      Number.isSafeInteger(frame.line1) &&
      Number.isSafeInteger(frame.column1) &&
      frame.line1 > 0 &&
      frame.line1 <= lines.length &&
      frame.column1 > 0 &&
      frame.column1 <= lines[frame.line1 - 1].length + 1
    )
      return source
  } catch {
    // A failed source lookup must not replace the actual authored Error.
  }
}

/**
 * Native Node stacks can already contain original coordinates. Accept those
 * only through the same immutable artifact map's retained source identity;
 * they are not generated positions and must never be mapped a second time.
 */
export function getTestStackFrames(
  stack: string,
  options?: FrameOptions
): TestStackFrame[] {
  const raw = parseStack(stack)
  const authored = raw.map(retainedAuthoredFrame)
  const mapped = getSourceMappedStackFrames(stack, options)
  // Both parsers retain every input frame. An actual retained original takes
  // precedence even if that source URL independently has another Node map.
  return raw.map((frame, index) => {
    const source = authored[index]
    if (source) return { kind: 'authored', frame, source }
    const result = mapped[index]
    return { kind: result.original ? 'mapped' : 'generated', frame: result }
  })
}

export function isTestFrameOriginal(frame: TestStackFrame): boolean {
  return frame.kind !== 'generated'
}

export function isTestFrameIgnored(frame: TestStackFrame): boolean {
  return frame.kind === 'authored' ? frame.source.ignored : frame.frame.ignored
}

export function getTestFrameSource(frame: TestStackFrame): string | null {
  return frame.kind === 'authored'
    ? frame.source.ignored
      ? null
      : frame.source.content
    : (frame.frame.getSourceContent?.() ?? null)
}
