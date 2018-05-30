// @flow
import React from 'react'
import {applySourcemaps} from './source-map-support'
import ErrorDebug, {styles} from '../lib/error-debug'
import type {RuntimeError, ErrorReporterProps} from './error-boundary'

type State = {|
  mappedError: null | RuntimeError
|}

// This component is only used in development, sourcemaps are applied on the fly because componentDidCatch is not async
class DevErrorOverlay extends React.Component<ErrorReporterProps, State> {
  state = {
    mappedError: null
  }

  componentDidMount () {
    const {error} = this.props

    // Since componentDidMount doesn't handle errors we use then/catch here
    applySourcemaps(error).then(() => {
      this.setState({mappedError: error})
    }).catch((caughtError) => {
      this.setState({mappedError: caughtError})
    })
  }

  render () {
    const {mappedError} = this.state
    const {info} = this.props
    if (mappedError === null) {
      return <div style={styles.errorDebug}>
        <h1 style={styles.heading}>Loading stacktrace...</h1>
      </div>
    }

    return <ErrorDebug error={mappedError} info={info} />
  }
}

export default DevErrorOverlay
