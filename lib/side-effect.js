import React, { Component } from 'react'

export default function withSideEffect (reduceComponentsToState, handleStateChangeOnClient, mapStateOnServer) {
  if (typeof reduceComponentsToState !== 'function') {
    throw new Error('Expected reduceComponentsToState to be a function.')
  }

  if (typeof handleStateChangeOnClient !== 'function') {
    throw new Error('Expected handleStateChangeOnClient to be a function.')
  }

  if (typeof mapStateOnServer !== 'undefined' && typeof mapStateOnServer !== 'function') {
    throw new Error('Expected mapStateOnServer to either be undefined or a function.')
  }

  function getDisplayName (WrappedComponent) {
    return WrappedComponent.displayName || WrappedComponent.name || 'Component'
  }

  return function wrap (WrappedComponent) {
    if (typeof WrappedComponent !== 'function') {
      throw new Error('Expected WrappedComponent to be a React component.')
    }

    const mountedInstances = new Set()
    let state
    let shouldEmitChange = false

    function emitChange (component) {
      state = reduceComponentsToState([...mountedInstances])

      if (SideEffect.canUseDOM) {
        handleStateChangeOnClient.call(component, state)
      } else if (mapStateOnServer) {
        state = mapStateOnServer(state)
      }
    }

    function maybeEmitChange (component) {
      if (!shouldEmitChange) return
      shouldEmitChange = false
      emitChange(component)
    }

    class SideEffect extends Component {
      // Try to use displayName of wrapped component
      static displayName = `SideEffect(${getDisplayName(WrappedComponent)})`

      static contextTypes = WrappedComponent.contextTypes

      // Expose canUseDOM so tests can monkeypatch it
      static canUseDOM = 'undefined' !== typeof window

      static peek () {
        return state
      }

      static rewind () {
        if (SideEffect.canUseDOM) {
          throw new Error('You may only call rewind() on the server. Call peek() to read the current state.')
        }

        maybeEmitChange()

        const recordedState = state
        state = undefined
        mountedInstances.clear()
        return recordedState
      }

      componentWillMount () {
        mountedInstances.add(this)
        shouldEmitChange = true
      }

      componentDidMount () {
        maybeEmitChange(this)
      }

      componentWillUpdate () {
        shouldEmitChange = true
      }

      componentDidUpdate () {
        maybeEmitChange(this)
      }

      componentWillUnmount () {
        mountedInstances.delete(this)
        shouldEmitChange = false
        emitChange(this)
      }

      render () {
        return <WrappedComponent>{ this.props.children }</WrappedComponent>
      }
    }

    return SideEffect
  }
}
