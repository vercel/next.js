import createStore from 'next/dist/compiled/unistore'
import formatWebpackMessages from '../../shared/lib/format-webpack-messages'
import { store as consoleStore } from './store'
import type { OutputState } from './store'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { COMPILER_NAMES } from '../../shared/lib/constants'
import type { CompilerNameValues } from '../../shared/lib/constants'

type CompilerDiagnostics = {
  totalModulesCount: number
  errors: string[] | null
  warnings: string[] | null
}

type WebpackStatus =
  | { loading: true }
  | ({ loading: false } & CompilerDiagnostics)

type BuildStatusStore = {
  client: WebpackStatus
  server: WebpackStatus
  edgeServer: WebpackStatus
  trigger: string | undefined
  url: string | undefined
}

const buildStore = createStore<BuildStatusStore>({
  // @ts-expect-error initial value
  client: {},
  // @ts-expect-error initial value
  server: {},
  // @ts-expect-error initial value
  edgeServer: {},
})
let buildWasDone = false
let clientWasLoading = true
let serverWasLoading = true
let edgeServerWasLoading = false

buildStore.subscribe((state) => {
  const { client, server, edgeServer, trigger, url } = state

  const { appUrl } = consoleStore.getState()

  if (client.loading || server.loading || edgeServer?.loading) {
    consoleStore.setState(
      {
        bootstrap: false,
        appUrl: appUrl!,
        // If it takes more than 3 seconds to compile, mark it as loading status
        loading: true,
        trigger,
        url,
      } as OutputState,
      true
    )
    clientWasLoading = (!buildWasDone && clientWasLoading) || client.loading
    serverWasLoading = (!buildWasDone && serverWasLoading) || server.loading
    edgeServerWasLoading =
      (!buildWasDone && edgeServerWasLoading) || edgeServer.loading
    buildWasDone = false
    return
  }

  buildWasDone = true

  let partialState: Partial<OutputState> = {
    bootstrap: false,
    appUrl: appUrl!,
    loading: false,
    typeChecking: false,
    totalModulesCount:
      (clientWasLoading ? client.totalModulesCount : 0) +
      (serverWasLoading ? server.totalModulesCount : 0) +
      (edgeServerWasLoading ? edgeServer?.totalModulesCount || 0 : 0),
    hasEdgeServer: !!edgeServer,
  }
  if (client.errors && clientWasLoading) {
    // Show only client errors
    consoleStore.setState(
      {
        ...partialState,
        errors: client.errors,
        warnings: null,
      } as OutputState,
      true
    )
  } else if (server.errors && serverWasLoading) {
    consoleStore.setState(
      {
        ...partialState,
        errors: server.errors,
        warnings: null,
      } as OutputState,
      true
    )
  } else if (edgeServer.errors && edgeServerWasLoading) {
    consoleStore.setState(
      {
        ...partialState,
        errors: edgeServer.errors,
        warnings: null,
      } as OutputState,
      true
    )
  } else {
    // Show warnings from all of them
    const warnings = [
      ...(client.warnings || []),
      ...(server.warnings || []),
      ...(edgeServer.warnings || []),
    ]

    consoleStore.setState(
      {
        ...partialState,
        errors: null,
        warnings: warnings.length === 0 ? null : warnings,
      } as OutputState,
      true
    )
  }
})

export function watchCompilers(
  client: webpack.Compiler,
  server: webpack.Compiler,
  edgeServer: webpack.Compiler
) {
  buildStore.setState({
    client: { loading: true },
    server: { loading: true },
    edgeServer: { loading: true },
    trigger: 'initial',
    url: undefined,
  })

  function tapCompiler(
    key: CompilerNameValues,
    compiler: webpack.Compiler,
    onEvent: (status: WebpackStatus) => void
  ) {
    compiler.hooks.invalid.tap(`NextJsInvalid-${key}`, () => {
      onEvent({ loading: true })
    })

    compiler.hooks.done.tap(`NextJsDone-${key}`, (stats: webpack.Stats) => {
      const { errors, warnings } = formatWebpackMessages(
        stats.toJson({
          preset: 'errors-warnings',
          moduleTrace: true,
        })
      )

      const hasErrors = !!errors?.length
      const hasWarnings = !!warnings?.length

      onEvent({
        loading: false,
        totalModulesCount: stats.compilation.modules.size,
        errors: hasErrors ? errors : null,
        warnings: hasWarnings ? warnings : null,
      })
    })
  }

  tapCompiler(COMPILER_NAMES.client, client, (status) => {
    if (
      !status.loading &&
      !buildStore.getState().server.loading &&
      !buildStore.getState().edgeServer.loading &&
      status.totalModulesCount > 0
    ) {
      buildStore.setState({
        client: status,
        trigger: undefined,
        url: undefined,
      })
    } else {
      buildStore.setState({
        client: status,
      })
    }
  })
  tapCompiler(COMPILER_NAMES.server, server, (status) => {
    if (
      !status.loading &&
      !buildStore.getState().client.loading &&
      !buildStore.getState().edgeServer.loading &&
      status.totalModulesCount > 0
    ) {
      buildStore.setState({
        server: status,
        trigger: undefined,
        url: undefined,
      })
    } else {
      buildStore.setState({
        server: status,
      })
    }
  })
  tapCompiler(COMPILER_NAMES.edgeServer, edgeServer, (status) => {
    if (
      !status.loading &&
      !buildStore.getState().client.loading &&
      !buildStore.getState().server.loading &&
      status.totalModulesCount > 0
    ) {
      buildStore.setState({
        edgeServer: status,
        trigger: undefined,
        url: undefined,
      })
    } else {
      buildStore.setState({
        edgeServer: status,
      })
    }
  })
}

export function reportTrigger(trigger: string, url?: string) {
  buildStore.setState({
    trigger,
    url,
  })
}
