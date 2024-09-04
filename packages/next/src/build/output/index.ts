import { bold, red, yellow } from '../../lib/picocolors'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import textTable from 'next/dist/compiled/text-table'
import createStore from 'next/dist/compiled/unistore'
import formatWebpackMessages from '../../client/components/react-dev-overlay/internal/helpers/format-webpack-messages'
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

type AmpStatus = {
  message: string
  line: number
  col: number
  specUrl: string | null
  code: string
}

export type AmpPageStatus = {
  [page: string]: { errors: AmpStatus[]; warnings: AmpStatus[] }
}

type BuildStatusStore = {
  client: WebpackStatus
  server: WebpackStatus
  edgeServer: WebpackStatus
  trigger: string | undefined
  url: string | undefined
  amp: AmpPageStatus
}

export function formatAmpMessages(amp: AmpPageStatus) {
  let output = bold('Amp Validation') + '\n\n'
  let messages: string[][] = []

  const chalkError = red('error')
  function ampError(page: string, error: AmpStatus) {
    messages.push([page, chalkError, error.message, error.specUrl || ''])
  }

  const chalkWarn = yellow('warn')
  function ampWarn(page: string, warn: AmpStatus) {
    messages.push([page, chalkWarn, warn.message, warn.specUrl || ''])
  }

  for (const page in amp) {
    let { errors, warnings } = amp[page]

    const devOnlyFilter = (err: AmpStatus) => err.code !== 'DEV_MODE_ONLY'
    errors = errors.filter(devOnlyFilter)
    warnings = warnings.filter(devOnlyFilter)
    if (!(errors.length || warnings.length)) {
      // Skip page with no non-dev warnings
      continue
    }

    if (errors.length) {
      ampError(page, errors[0])
      for (let index = 1; index < errors.length; ++index) {
        ampError('', errors[index])
      }
    }
    if (warnings.length) {
      ampWarn(errors.length ? '' : page, warnings[0])
      for (let index = 1; index < warnings.length; ++index) {
        ampWarn('', warnings[index])
      }
    }
    messages.push(['', '', '', ''])
  }

  if (!messages.length) {
    return ''
  }

  output += textTable(messages, {
    align: ['l', 'l', 'l', 'l'],
    stringLength(str: string) {
      return stripAnsi(str).length
    },
  })

  return output
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
  const { amp, client, server, edgeServer, trigger, url } = state

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
    ].concat(formatAmpMessages(amp) || [])

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

export function ampValidation(
  page: string,
  errors: AmpStatus[],
  warnings: AmpStatus[]
) {
  const { amp } = buildStore.getState()
  if (!(errors.length || warnings.length)) {
    buildStore.setState({
      amp: Object.keys(amp)
        .filter((k) => k !== page)
        .sort()
        // eslint-disable-next-line no-sequences
        .reduce((a, c) => ((a[c] = amp[c]), a), {} as AmpPageStatus),
    })
    return
  }

  const newAmp: AmpPageStatus = { ...amp, [page]: { errors, warnings } }
  buildStore.setState({
    amp: Object.keys(newAmp)
      .sort()
      // eslint-disable-next-line no-sequences
      .reduce((a, c) => ((a[c] = newAmp[c]), a), {} as AmpPageStatus),
  })
}

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
      buildStore.setState({ amp: {} })

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
