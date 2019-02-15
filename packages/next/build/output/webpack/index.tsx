import React, { Component } from 'react'
import { render, Color, Text } from 'ink'
import formatWebpackMessages from '../../../client/dev-error-overlay/format-webpack-messages'
import {
  WebpackOutputProps,
  WebpackOutputStatus,
  WebpackOutputState,
  DEFAULT_WEBPACK_OUTPUT_STATE,
} from './types'

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

  private tap() {
    this.tapCompiler('client', this.props.client, status =>
      this.setState({ client: status })
    )
    this.tapCompiler('server', this.props.server, status =>
      this.setState({ server: status })
    )
  }

  render() {
    const {
      client_loading,
      server_loading,
      client_messages,
      server_messages,
    } = this.state
    if (client_loading || server_loading) {
      return <Text>Compiling ...</Text>
    }

    let errors: string[] | undefined
    if (
      client_messages &&
      client_messages.errors &&
      client_messages.errors.length
    ) {
      errors = client_messages.errors
    } else if (
      server_messages &&
      server_messages.errors &&
      server_messages.errors.length
    ) {
      errors = server_messages.errors
    }

    if (errors) {
      return (
        <>
          <Color red>Failed to compile.</Color>
          <br /> <br />
          <Text>{errors[0]}</Text>
        </>
      )
    }

    let warnings: string[] | undefined
    if (
      client_messages &&
      client_messages.warnings &&
      client_messages.warnings.length
    ) {
      warnings = client_messages.warnings
    } else if (
      server_messages &&
      server_messages.warnings &&
      server_messages.warnings.length
    ) {
      warnings = server_messages.warnings
    }

    if (warnings) {
      return (
        <>
          <Color yellow>Compiled with warnings.</Color>
          <br /> <br />
          <Text>{warnings.join('\n\n')}</Text>
        </>
      )
    }

    return (
      <>
        <Color green>Compiled successfully!</Color>
        <br /> <br />
      </>
    )
  }
}

export function watchCompilers(client: any, server: any) {
  render(<CompilerOutput client={client} server={server} />)
}
