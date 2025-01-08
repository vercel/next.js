import type { OriginalStackFrame } from '../../../helpers/stack-frame'
import { useMemo, useState } from 'react'
import { CallStackFrame } from '../../call-stack-frame/call-stack-frame'
import { noop as css } from '../../../helpers/noop-template'

type CallStackProps = {
  frames: OriginalStackFrame[]
}

export function CallStack({ frames }: CallStackProps) {
  const [isIgnoreListOpen, setIsIgnoreListOpen] = useState(false)

  const { filteredFrames, ignoreListLength } = useMemo(() => {
    const filtered = []
    let ignoredLength = 0

    for (const frame of frames) {
      if (isIgnoreListOpen || !frame.ignored) {
        filtered.push(frame)
      }
      if (frame.ignored) {
        ignoredLength++
      }
    }

    return {
      filteredFrames: filtered,
      ignoreListLength: ignoredLength,
    }
  }, [frames, isIgnoreListOpen])

  return (
    <>
      <div className="error-overlay-call-stack-header">
        <p>
          Call Stack<span>{frames.length}</span>
        </p>
        {ignoreListLength > 0 && (
          <button
            data-expand-ignore-button={isIgnoreListOpen}
            onClick={() => setIsIgnoreListOpen(!isIgnoreListOpen)}
          >
            {`${isIgnoreListOpen ? 'Hide' : 'Show'} ${ignoreListLength} Ignore-listed Frames`}
          </button>
        )}
      </div>
      {filteredFrames.map((frame, frameIndex) => (
        <CallStackFrame
          key={`call-stack-leading-${frameIndex}`}
          frame={frame}
        />
      ))}
    </>
  )
}

export const CALL_STACK_STYLES = css`
  .error-overlay-call-stack-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
`
