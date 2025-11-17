import type { OriginalStackFrame } from '../../../../shared/stack-frame'
import { useMemo, useState, useRef } from 'react'
import { CallStack } from '../../call-stack/call-stack'

interface CallStackProps {
  frames: readonly OriginalStackFrame[]
  dialogResizerRef: React.RefObject<HTMLDivElement | null>
}

export function ErrorOverlayCallStack({
  frames,
  dialogResizerRef,
}: CallStackProps) {
  const initialDialogHeight = useRef<number>(NaN)
  const [isIgnoreListOpen, setIsIgnoreListOpen] = useState(false)

  const ignoredFramesTally = useMemo(() => {
    return frames.reduce((tally, frame) => tally + (frame.ignored ? 1 : 0), 0)
  }, [frames])

  function onToggleIgnoreList() {
    const dialog = dialogResizerRef?.current

    if (!dialog) {
      return
    }

    const { height: currentHeight } = dialog.getBoundingClientRect()

    if (!initialDialogHeight.current) {
      initialDialogHeight.current = currentHeight
    }

    if (isIgnoreListOpen) {
      function onTransitionEnd() {
        // TS bug. We closed over a non-nullable value here.
        dialog!.removeEventListener('transitionend', onTransitionEnd)
        setIsIgnoreListOpen(false)
      }
      // eslint-disable-next-line react-hooks/immutability -- Bug in react-hooks/react-compiler
      dialog.style.height = `${initialDialogHeight.current}px`
      dialog.addEventListener('transitionend', onTransitionEnd)
    } else {
      setIsIgnoreListOpen(true)
    }
  }

  return (
    <CallStack
      frames={frames}
      isIgnoreListOpen={isIgnoreListOpen}
      onToggleIgnoreList={onToggleIgnoreList}
      ignoredFramesTally={ignoredFramesTally}
    />
  )
}
