import React, { Component } from 'react'
import {polyfill} from 'react-lifecycles-compat'
import { getDisplayName } from './utils'

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

  return function wrap (WrappedComponent) {
    if (typeof WrappedComponent !== 'function') {
      throw new Error('Expected WrappedComponent to be a React component.')
    }

    const mountedInstances = new Set()
    let state

    function emitChange (component) {
      state = reduceComponentsToState([...mountedInstances])

      if (SideEffect.canUseDOM) {
        handleStateChangeOnClient.call(component, state)
      } else if (mapStateOnServer) {
        state = mapStateOnServer(state)
      }
    }

    class SideEffect extends Component {
      // Expose canUseDOM so tests can monkeypatch it
      static canUseDOM = typeof window !== 'undefined'

      static contextTypes = WrappedComponent.contextTypes

      // Try to use displayName of wrapped component
      static displayName = `SideEffect(${getDisplayName(WrappedComponent)})`

      static peek () {
        return state
      }

      static rewind () {
        if (SideEffect.canUseDOM) {
          throw new Error('You may only call rewind() on the server. Call peek() to read the current state.')
        }

        const recordedState = state
        state = undefined
        mountedInstances.clear()
        return recordedState
      }

      componentDidUpdate () {
        emitChange(this)
      }

      componentWillUnmount () {
        mountedInstances.delete(this)
        emitChange(this)
      }

      // eslint-disable-next-line camelcase
      UNSAFE_componentWillMount () {
        mountedInstances.add(this)
        emitChange(this)
      }

      render () {
        return <WrappedComponent>{ this.props.children }</WrappedComponent>
      }
    }

    // Make UNSAFE_ compatible with version of React under 16.3
    polyfill(SideEffect)

    return SideEffect
  }
}
