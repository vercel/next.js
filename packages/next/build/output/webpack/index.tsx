import React, { Component } from 'react'
import { render, Color, Text } from 'ink'
import formatWebpackMessages from '../../../client/dev-error-overlay/format-webpack-messages'

class CompilerOutput extends Component<
  WebpackOutputProps,
  WebpackOutputState
> {
  state: WebpackOutputState = {
    client_loading: true,
    server_loading: true,
    client_messages: null,
    server_messages: null,
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
    this.props.client.hooks.invalid.tap('NextJsClientPrompt', () => {
      this.setState({ client_loading: true, client_messages: null })
    })
    this.props.server.hooks.invalid.tap('NextJsServerPrompt', () => {
      this.setState({ server_loading: true, server_messages: null })
    })

    this.props.client.hooks.done.tap('NextJsClientDone', (stats: any) => {
      const messages = formatWebpackMessages(
        stats.toJson({ all: false, warnings: true, errors: true })
      )

      this.setState({ client_loading: false, client_messages: messages })
    })
    this.props.server.hooks.done.tap('NextJsServerDone', (stats: any) => {
      const messages = formatWebpackMessages(
        stats.toJson({ all: false, warnings: true, errors: true })
      )

      this.setState({ server_loading: false, server_messages: messages })
    })
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
