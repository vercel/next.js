import type React from 'react'
import { Children, useEffect, useLayoutEffect, type JSX } from 'react'

type State = JSX.Element[] | undefined

export type SideEffectProps = {
  reduceComponentsToState: (components: Array<React.ReactElement<any>>) => State
  handleStateChange?: (state: State) => void
  headManager: any
  children: React.ReactNode
}

const isServer = typeof window === 'undefined'
const useClientOnlyLayoutEffect = isServer ? () => {} : useLayoutEffect
const useClientOnlyEffect = isServer ? () => {} : useEffect

export default function SideEffect(props: SideEffectProps) {
  const { headManager, reduceComponentsToState } = props

  function emitChange() {
    if (headManager && headManager.mountedInstances) {
      const headElements = Children.toArray(
        Array.from(headManager.mountedInstances as Set<React.ReactNode>).filter(
          Boolean
        )
      ) as React.ReactElement[]
      headManager.updateHead(reduceComponentsToState(headElements))
    }
  }

  if (isServer) {
    headManager?.mountedInstances?.add(props.children)
    emitChange()
  }

  useClientOnlyLayoutEffect(() => {
    headManager?.mountedInstances?.add(props.children)
    return () => {
      headManager?.mountedInstances?.delete(props.children)
    }
  })

  // We need to call `updateHead` method whenever the `SideEffect` is trigger in all
  // life-cycles: mount, update, unmount. However, if there are multiple `SideEffect`s
  // being rendered, we only trigger the method from the last one.
  // This is ensured by keeping the last unflushed `updateHead` in the `_pendingUpdate`
  // singleton in the layout effect pass, and actually trigger it in the effect pass.
  useClientOnlyLayoutEffect(() => {
    if (headManager) {
      headManager._pendingUpdate = emitChange
    }
    return () => {
      if (headManager) {
        headManager._pendingUpdate = emitChange
      }
    }
  })

  useClientOnlyEffect(() => {
    if (headManager && headManager._pendingUpdate) {
      headManager._pendingUpdate()
      headManager._pendingUpdate = null
    }
    return () => {
      if (headManager && headManager._pendingUpdate) {
        headManager._pendingUpdate()
        headManager._pendingUpdate = null
      }
    }
  })

  return null
}
