import React, { Component, ReactNode } from 'react'

const isServer = typeof window === 'undefined'

type State = Array<React.ReactElement<any>> | undefined

type SideEffectProps = {
  reduceComponentsToState: <T>(components: Array<React.ReactElement<any>>, props: T) => State,
  handleStateChange?: (state: State) => void,
}

export default function withSideEffect<MoreProps>() {
  const mountedInstances: Set<any> = new Set()
  let state: State

  function emitChange(component: React.Component<SideEffectProps & MoreProps>) {
    state = component.props.reduceComponentsToState([...mountedInstances], component.props)
    if (component.props.handleStateChange) {
      component.props.handleStateChange(state)
    }
  }

  class SideEffect extends Component<SideEffectProps & MoreProps> {
    // Used when server rendering
    static rewind() {
      const recordedState = state
      state = undefined
      mountedInstances.clear()
      return recordedState
    }

    constructor(props: any) {
      super(props)
      if (isServer) {
        mountedInstances.add(this)
        emitChange(this)
      }
    }
    componentDidMount() {
      mountedInstances.add(this)
      emitChange(this)
    }
    componentDidUpdate() {
      emitChange(this)
    }
    componentWillUnmount() {
      mountedInstances.delete(this)
      emitChange(this)
    }

    render() {
      return null
    }
  }

  return SideEffect
}
