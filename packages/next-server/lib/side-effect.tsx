import React, { Component } from 'react'

const isServer = typeof window === 'undefined'

type State = Array<React.ReactElement<any>> | undefined

type SideEffectProps = {
  reduceComponentsToState: (components: Array<React.ReactElement<any>>) => State,
  handleStateChange?: (state: State) => void,
}

export default function withSideEffect() {
  const mountedInstances: Set<any> = new Set()
  let state: State

  function emitChange(component: React.Component<SideEffectProps>) {
    state = component.props.reduceComponentsToState([...mountedInstances])
    if (component.props.handleStateChange) {
      component.props.handleStateChange(state)
    }
  }

  class SideEffect extends Component<SideEffectProps> {
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
