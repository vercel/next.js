import React, { Component } from 'react'
import { render, Color, Text } from 'ink'
import formatWebpackMessages from '../../../client/dev-error-overlay/format-webpack-messages'
import {
  WebpackOutputProps,
  WebpackOutputStatus,
  WebpackOutputState,
  WebpackOutputPhase,
  DEFAULT_WEBPACK_OUTPUT_STATE,
} from './types'

import { lastAppUrl } from '../boot'

function getWebpackStatusPhase(
  status: WebpackOutputStatus
): WebpackOutputPhase {
  if (status.loading) {
    return WebpackOutputPhase.COMPILING
  }
  if (status.errors) {
    return WebpackOutputPhase.COMPILED_WITH_ERRORS
  }
  if (status.warnings) {
    return WebpackOutputPhase.COMPILED_WITH_WARNINGS
  }
  return WebpackOutputPhase.COMPILED
}

class CompilerOutput extends Component<WebpackOutputProps, WebpackOutputState> {
  state: WebpackOutputState = DEFAULT_WEBPACK_OUTPUT_STATE

  private tapCompiler = (
    key: string,
    compiler: any,
    onEvent: (status: WebpackOutputStatus) => void
  ) => {
    compiler.hooks.invalid.tap(`NextJsInvalid-${key}`, () => {
      onEvent({ loading: true })
    })

    compiler.hooks.done.tap(`NextJsDone-${key}`, (stats: any) => {
      const { errors, warnings } = formatWebpackMessages(
        stats.toJson({ all: false, warnings: true, errors: true })
      )

      onEvent({
        loading: false,
        errors: errors && errors.length ? errors : null,
        warnings: warnings && warnings.length ? warnings : null,
      })
    })
  }

  componentDidMount() {
    this.tap()
  }
  componentDidUpdate(prevProps: WebpackOutputProps) {
    if (
      prevProps.client !== this.props.client ||
      prevProps.server !== this.props.server
    ) {
      this.tap()
    }
  }

  private tap = () => {
    this.tapCompiler('client', this.props.client, status =>
      this.setState({ client: status })
    )
    this.tapCompiler('server', this.props.server, status =>
      this.setState({ server: status })
    )
  }

  render() {
    const { client, server } = this.state
    const [{ status, phase }] = [
      { status: client, phase: getWebpackStatusPhase(client) },
      { status: server, phase: getWebpackStatusPhase(server) },
    ].sort((a, b) => a.phase.valueOf() - b.phase.valueOf())

    switch (phase) {
      case WebpackOutputPhase.COMPILED_WITH_ERRORS: {
        if (status.loading !== false) {
          return
        }
        return (
          <>
            <Color red>Failed to compile.</Color>
            <br /> <br />
            <Text>{status.errors![0]}</Text>
          </>
        )
      }
      case WebpackOutputPhase.COMPILED_WITH_WARNINGS: {
        if (status.loading !== false) {
          return
        }
        return (
          <>
            <Color yellow>Compiled with warnings.</Color>
            <br /> <br />
            <Text>{status.warnings!.join('\n\n')}</Text>
          </>
        )
      }
      case WebpackOutputPhase.COMPILED: {
        return (
          <>
            <Color green>Compiled successfully!</Color>
            <br /> <br />
            <Text>You can now view your app in the browser.</Text>
            <br /> <br />
            <Text>
              {'  > '}
              {this.props.appUrl}
            </Text>
            <br /> <br />
            <Text>
              Note that pages will be compiled when you first load them.
            </Text>
          </>
        )
      }
      default: {
        return <Text>Compiling ...</Text>
      }
    }
  }
}

export function watchCompilers(client: any, server: any) {
  render(
    <CompilerOutput appUrl={lastAppUrl!} client={client} server={server} />
  )
}
