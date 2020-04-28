import * as React from 'react'
import { StackFrame } from 'stacktrace-parser'
import { CodeFrame } from '../../components/CodeFrame'
import { Overlay } from '../../components/Overlay'
import { RuntimeErrorObject } from './index'
import { createOriginalStackFrame, getFrameSource } from './utils'

export type ResolvedRuntimeErrorsProps = {
  errors: ResolvedRuntimeError[]
}
export type ResolvedRuntimeError = {
  eventId: string
  error: Error
  frames: ResolvedStackFrame[]
}
export type ResolvedStackFrame =
  | { error: true; frame: StackFrame }
  | { external: true; frame: StackFrame }
  | {
      external: false
      collapsed: boolean
      sourceStackFrame: StackFrame
      originalStackFrame: StackFrame
      originalCodeFrame: string | null
    }

export type ResolvedStackFrameGroup = {
  collapsed: boolean
  frames: ResolvedStackFrame[]
}

async function getResolvedFrame(
  frame: StackFrame
): Promise<ResolvedStackFrame> {
  if (!frame.file?.startsWith('webpack-internal:///')) {
    const f: ResolvedStackFrame = { external: true, frame }
    return f
  }

  const params = new URLSearchParams()
  params.append('fileName', frame.file)
  params.append('lineNumber', String(frame.lineNumber))
  params.append('columnNumber', String(frame.column))

  const controller = new AbortController()
  const tm = setTimeout(() => controller.abort(), 3000)
  return self
    .fetch(`/__nextjs_resolve-stack-frame?${params.toString()}`, {
      signal: controller.signal,
    })
    .then(res => res.json())
    .then(body => {
      if (
        typeof body !== 'object' ||
        !('fileName' in body && 'lineNumber' in body)
      ) {
        const f: ResolvedStackFrame = { external: true, frame }
        return f
      }
      const b: {
        fileName: unknown
        lineNumber: unknown
        columnNumber: unknown
        originalCodeFrame: unknown
      } = body
      const f: ResolvedStackFrame = {
        external: false,
        sourceStackFrame: frame,
        collapsed:
          typeof b.fileName !== 'string' || b.fileName.includes('node_modules'),

        // TODO: remedy:
        originalStackFrame: createOriginalStackFrame(
          frame,
          b.fileName as any,
          b.lineNumber as any,
          b.columnNumber as any
        ),
        originalCodeFrame:
          typeof b.originalCodeFrame === 'string' ? b.originalCodeFrame : null,
      }
      return f
    })
    .finally(() => {
      clearTimeout(tm)
    })
}

export async function getResolvedRuntimeError(
  error: RuntimeErrorObject
): Promise<ResolvedRuntimeError> {
  const resolvedFrames: ResolvedStackFrame[] = await Promise.all(
    error.frames.map(frame =>
      getResolvedFrame(frame).then(
        frame => frame,
        () => {
          // This isn't shorthanded for TypeScript compatibility reasons:
          const f: ResolvedStackFrame = { error: true, frame }
          return f
        }
      )
    )
  )
  return { eventId: error.eventId, error: error.error, frames: resolvedFrames }
}

const BasicFrame: React.FC<{
  frame: ResolvedStackFrame
}> = function BasicFrame({ frame }) {
  if ('frame' in frame) {
    const f = frame.frame
    return (
      <div data-nextjs-call-stack-frame>
        <h6>{f.methodName}</h6>
        <p>{getFrameSource(f)}</p>
      </div>
    )
  }
  if ('originalStackFrame' in frame) {
    // TODO: collapsed rich frame should offer to expand
    const f = frame.originalStackFrame
    const s = frame.sourceStackFrame
    return (
      <div data-nextjs-call-stack-frame>
        <h6>{s.methodName}</h6>
        <p>{getFrameSource(f)}</p>
      </div>
    )
  }

  // TODO: refactor so this can't happen
  return null
}

const RichFrame: React.FC<{
  frame: ResolvedStackFrame
}> = function RichFrame({ frame }) {
  if ('external' in frame && frame.external === false) {
    const f = frame
    return (
      <CodeFrame
        stackFrame={f.originalStackFrame}
        codeFrame={f.originalCodeFrame}
      />
    )
  }
  return <BasicFrame frame={frame} />
}

const FrameGroup: React.FC<{
  group: ResolvedStackFrameGroup
}> = function FrameGroup({ group }) {
  if (group.collapsed) {
    // TODO: show these collapsed by default
    return (
      <React.Fragment>
        {group.frames.map((frame, index) => (
          <RichFrame
            key={`collapsed-frame-group-frame-${index}`}
            frame={frame}
          />
        ))}
      </React.Fragment>
    )
  }
  return (
    <React.Fragment>
      {group.frames.map((frame, index) => (
        <RichFrame key={`frame-group-rich-frame-${index}`} frame={frame} />
      ))}
    </React.Fragment>
  )
}

const Frames: React.FC<{ frames: ResolvedStackFrame[] }> = function Frames({
  frames,
}) {
  const firstFirstPartyFrameIndex = React.useMemo<number>(() => {
    const idx = frames.findIndex(
      entry =>
        'external' in entry &&
        entry.external === false &&
        'collapsed' in entry &&
        entry.collapsed === false
    )
    if (idx === -1) {
      return frames.length
    }
    return idx
  }, [frames])
  const leadingFrames = React.useMemo<ResolvedStackFrame[]>(
    () => frames.slice(0, firstFirstPartyFrameIndex),
    [frames, firstFirstPartyFrameIndex]
  )
  const frameGroups = React.useMemo<ResolvedStackFrameGroup[]>(() => {
    const remaining = frames.slice(firstFirstPartyFrameIndex + 1)
    if (remaining.length < 1) {
      return []
    }

    let groups: ResolvedStackFrameGroup[] = []
    for (
      let idx = 0, collapsedFrames: ResolvedStackFrame[] = [];
      idx < remaining.length;
      ++idx
    ) {
      const r = remaining[idx]
      if (!('collapsed' in r) || r.collapsed) {
        collapsedFrames.push(r)
      } else {
        if (collapsedFrames.length) {
          groups.push({ collapsed: true, frames: [...collapsedFrames] })
          collapsedFrames = []
        }
        groups.push({ collapsed: false, frames: [r] })
      }

      if (idx === remaining.length - 1 && collapsedFrames.length) {
        groups.push({ collapsed: true, frames: [...collapsedFrames] })
      }
    }
    return groups
  }, [frames, firstFirstPartyFrameIndex])
  return (
    <React.Fragment>
      {frames[firstFirstPartyFrameIndex] && <h5>Source</h5>}
      {...leadingFrames.map((frame, index) => (
        <BasicFrame key={`leading-frame-${index}`} frame={frame} />
      ))}
      {frames[firstFirstPartyFrameIndex] && (
        <RichFrame frame={frames[firstFirstPartyFrameIndex]} />
      )}
      {frameGroups.length && (
        <React.Fragment>
          <h5>Call Stack</h5>
          {frameGroups.map((group, index) => (
            <FrameGroup key={`frame-group-${index}`} group={group} />
          ))}
        </React.Fragment>
      )}
    </React.Fragment>
  )
}

export const ResolvedRuntimeErrors: React.FC<ResolvedRuntimeErrorsProps> = function ResolvedRuntimeErrors({
  errors,
}) {
  const [idx, setIdx] = React.useState(0)

  const previous = React.useCallback(() => {
    setIdx(v => Math.max(0, v - 1))
  }, [setIdx])
  const next = React.useCallback(() => {
    setIdx(v => Math.min(v + 1, errors.length - 1))
  }, [setIdx, errors.length])

  // TODO: keyboard accessibility:
  // - arrow key navigation
  // - escape to minimize
  // - proper a11y for elements
  return (
    <Overlay>
      <div
        data-nextjs-dialog-content
        tabIndex={-1}
        role="dialog"
        aria-labelledby="nextjs__runtime_errors"
        aria-modal="true"
      >
        <div data-nextjs-dialog-header className="error">
          <div>
            <nav>
              <button type="button" disabled={idx === 0} onClick={previous}>
                &larr;
              </button>
              <button
                type="button"
                disabled={idx === errors.length - 1}
                onClick={next}
              >
                &rarr;
              </button>
              &nbsp;
              <span>
                {idx + 1} of {errors.length} unhandled error
                {errors.length < 2 ? '' : 's'}
              </span>
            </nav>
            <h4 id="nextjs__runtime_errors">Unhandled Runtime Error</h4>
            <p className="mono">
              {errors[idx].error.name}: {errors[idx].error.message}
            </p>
          </div>
          <button className="close" type="button" aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div data-nextjs-dialog-body>
          <Frames frames={errors[idx].frames} />
        </div>
      </div>
    </Overlay>
  )
}
