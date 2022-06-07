import React, { Children, useEffect, useRef } from 'react'

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
  const childrenRef = useRef(props.children)
  useEffect(() => {
    childrenRef.current = props.children
  })

  useEffect(() => {
    const { headManager, reduceComponentsToState } = props
    if (headManager) {
      const heads = Children.toArray(childrenRef.current).filter(
        Boolean
      ) as React.ReactElement[]
      headManager.updateHead(reduceComponentsToState(heads, props))
    }
  })
  return null
}
