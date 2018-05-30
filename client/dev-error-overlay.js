// @flow
import React from 'react'
import {applySourcemaps} from './source-map-support'
import ErrorDebug, {styles} from '../lib/error-debug'
import type {ErrorReporterProps} from './error-boundary'

type State = {
  mappedError: null | Error
}

// This component is only used in development, sourcemaps are applied on the fly because componentDidCatch is not async
class DevErrorOverlay extends React.Component<ErrorReporterProps, State> {
  state = {
    mappedError: null
  }

  componentDidMount () {
    const {error} = this.props

    // If sourcemaps were already applied there is no need to set the state
    if (error.sourceMapsApplied) {
      return
    }

    // Since componentDidMount doesn't handle errors we use then/catch here
    applySourcemaps(error).then(() => {
      this.setState({mappedError: error})
    }).catch(console.error)
  }

  render () {
    const {mappedError} = this.state
    const {error, info} = this.props
    if (!error.sourceMapsApplied && mappedError === null) {
      return <div style={styles.errorDebug}>
        <h1 style={styles.heading}>Loading stacktrace...</h1>
      </div>
    }

    return <ErrorDebug error={error} info={info} />
  }
}

export default DevErrorOverlay
