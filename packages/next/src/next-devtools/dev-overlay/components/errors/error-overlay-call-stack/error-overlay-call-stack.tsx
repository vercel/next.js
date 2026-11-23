import type { OriginalStackFrame } from '../../../../shared/stack-frame'
import { useMemo, useState } from 'react'
import { CallStack } from '../../call-stack/call-stack'

interface CallStackProps {
  frames: readonly OriginalStackFrame[]
}

export function ErrorOverlayCallStack({ frames }: CallStackProps) {
  const [isIgnoreListOpen, setIsIgnoreListOpen] = useState(false)

  const ignoredFramesTally = useMemo(() => {
    return frames.reduce((tally, frame) => tally + (frame.ignored ? 1 : 0), 0)
  }, [frames])

  return (
    <CallStack
      frames={frames}
      isIgnoreListOpen={isIgnoreListOpen}
      onToggleIgnoreList={() => setIsIgnoreListOpen((open) => !open)}
      ignoredFramesTally={ignoredFramesTally}
    />
  )
}
