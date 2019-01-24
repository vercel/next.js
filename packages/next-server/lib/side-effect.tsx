import React, { Component } from 'react'

const isServer = typeof window === 'undefined'

type State = React.DetailedReactHTMLElement<any, any>[] | undefined

export default function withSideEffect (
  reduceComponentsToState: (components: React.ReactElement<any>[]) => React.DetailedReactHTMLElement<any, any>[],
  handleStateChangeOnClient: (state: State) => void,
  mapStateOnServer: (state: State) => State
) {
  return (WrappedComponent: React.ComponentClass<any>) => {
    const mountedInstances: Set<any> = new Set()
    let state: State

    function emitChange (component: React.ReactInstance) {
      state = reduceComponentsToState([...mountedInstances])

      if (!isServer) {
        handleStateChangeOnClient.call(component, state)
      } else if (mapStateOnServer) {
        state = mapStateOnServer(state)
      }
    }

    class SideEffect extends Component<any> {
      static contextType = WrappedComponent.contextType
      static rewind () {
        const recordedState = state
        state = undefined
        mountedInstances.clear()
        return recordedState
      }

      constructor (props: any) {
        super(props)
        if (isServer) {
          mountedInstances.add(this)
          emitChange(this)
        }
      }
      componentDidMount () {
        mountedInstances.add(this)
        emitChange(this)
      }
      componentDidUpdate () {
        emitChange(this)
      }
      componentWillUnmount () {
        mountedInstances.delete(this)
        emitChange(this)
      }

      render () {
        return null
      }
    }

    return SideEffect
  }
}
