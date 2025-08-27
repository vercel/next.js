import { useEffect, useRef, useState } from 'react'

export function useUpdateAnimation(
  issueCount: number,
  animationDurationMs = 0
) {
  const lastUpdatedTimeStamp = useRef<number | null>(null)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    if (issueCount > 0) {
      const deltaMs = lastUpdatedTimeStamp.current
        ? Date.now() - lastUpdatedTimeStamp.current
        : -1
      lastUpdatedTimeStamp.current = Date.now()

      // We don't animate if `issueCount` changes too quickly
      if (deltaMs <= animationDurationMs) {
        return
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect -- TODO
      setAnimate(true)
      // It is important to use a CSS transitioned state, not a CSS keyframed animation
      // because if the issue count increases faster than the animation duration, it
      // will abruptly stop and not transition smoothly back to its original state.
      const timeoutId = window.setTimeout(() => {
        setAnimate(false)
      }, animationDurationMs)

      return () => {
        clearTimeout(timeoutId)
      }
    }
  }, [issueCount, animationDurationMs])

  return animate
}
