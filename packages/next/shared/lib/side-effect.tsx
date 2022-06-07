import React, { Children, useEffect, useLayoutEffect } from 'react'

type State = JSX.Element[] | undefined

type SideEffectProps = {
  reduceComponentsToState: <T>(
    components: Array<React.ReactElement<any>>,
    props: T
  ) => State
  handleStateChange?: (state: State) => void
  headManager: any
  inAmpMode?: boolean
  children: React.ReactNode
}

export default function SideEffect(props: SideEffectProps) {
  const { headManager, reduceComponentsToState } = props

  function emitChange() {
    if (headManager && headManager.mountedInstances) {
      const headElements = Children.toArray(
        headManager.mountedInstances
      ).filter(Boolean) as React.ReactElement[]
      headManager.updateHead(reduceComponentsToState(headElements, props))
    }
  }

  if (typeof window === 'undefined') {
    headManager?.mountedInstances?.add(props.children)
    emitChange()
  }

  useLayoutEffect(() => {
    headManager?.mountedInstances?.add(props.children)
    return () => {
      headManager?.mountedInstances?.delete(props.children)
    }
  })

  // Cache emitChange in headManager in layout effects and execute later in effects.
  // Since `useEffect` is async effects emitChange will only keep the latest results.
  useLayoutEffect(() => {
    if (headManager) {
      headManager._pendingUpdate = emitChange
    }
  })

  useEffect(() => {
    if (headManager && headManager._pendingUpdate) {
      headManager._pendingUpdate()
      headManager._pendingUpdate = null
    }
  })

  return null
}
