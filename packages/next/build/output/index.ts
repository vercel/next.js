import createStore from 'next/dist/compiled/unistore'

import { store, OutputState } from './store'
import formatWebpackMessages from '../../client/dev-error-overlay/format-webpack-messages'

export function startedDevelopmentServer(appUrl: string) {
  store.setState({ appUrl })
}

let previousClient: any = null
let previousServer: any = null

type WebpackStatus =
  | { loading: true }
  | {
      loading: false
      errors: string[] | null
      warnings: string[] | null
    }

type WebpackStatusStore = {
  client: WebpackStatus
  server: WebpackStatus
}

enum WebpackStatusPhase {
  COMPILING = 1,
  COMPILED_WITH_ERRORS = 2,
  COMPILED_WITH_WARNINGS = 3,
  COMPILED = 4,
}

function getWebpackStatusPhase(status: WebpackStatus): WebpackStatusPhase {
  if (status.loading) {
    return WebpackStatusPhase.COMPILING
  }
  if (status.errors) {
    return WebpackStatusPhase.COMPILED_WITH_ERRORS
  }
  if (status.warnings) {
    return WebpackStatusPhase.COMPILED_WITH_WARNINGS
  }
  return WebpackStatusPhase.COMPILED
}

const webpackStore = createStore<WebpackStatusStore>()

webpackStore.subscribe(state => {
  const { client, server } = state

  const [{ status }] = [
    { status: client, phase: getWebpackStatusPhase(client) },
    { status: server, phase: getWebpackStatusPhase(server) },
  ].sort((a, b) => a.phase.valueOf() - b.phase.valueOf())

  const { bootstrap: bootstrapping, appUrl } = store.getState()
  if (bootstrapping && status.loading) {
    return
  }

  let nextStoreState: OutputState = {
    bootstrap: false,
    appUrl: appUrl!,
    ...status,
  }
  store.setState(nextStoreState, true)
})

export function watchCompiler(client: any, server: any) {
  if (previousClient === client && previousServer === server) {
    return
  }

  webpackStore.setState({
    client: { loading: true },
    server: { loading: true },
  })

  function tapCompiler(
    key: string,
    compiler: any,
    onEvent: (status: WebpackStatus) => void
  ) {
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

  tapCompiler('client', client, status =>
    webpackStore.setState({ client: status })
  )
  tapCompiler('server', server, status =>
    webpackStore.setState({ server: status })
  )

  previousClient = client
  previousServer = server
}
