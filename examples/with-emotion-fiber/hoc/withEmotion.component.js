import React, { Component } from 'react'
import { hydrate } from 'react-emotion'
import { injectGlobalStyles } from '../shared/styles'

const withEmotion = ComposedComponent => {
  class HOC extends Component {
    UNSAFE_componentWillMount() {
      if (typeof window !== 'undefined') {
        hydrate(window.__NEXT_DATA__.ids)
      }
      injectGlobalStyles()
    }

    render() {
      return <ComposedComponent />
    }
  }

  return HOC
}

export default withEmotion
