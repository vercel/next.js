import chalk from 'chalk'
import textTable from 'next/dist/compiled/text-table'
import createStore from 'next/dist/compiled/unistore'
import stripAnsi from 'strip-ansi'

import formatWebpackMessages from '../../client/dev/error-overlay/format-webpack-messages'
import { OutputState, store as consoleStore } from './store'
import forkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin'
import { NormalizedMessage } from 'fork-ts-checker-webpack-plugin/lib/NormalizedMessage'
import { createCodeframeFormatter } from 'fork-ts-checker-webpack-plugin/lib/formatter/codeframeFormatter'

export function startedDevelopmentServer(appUrl: string) {
  consoleStore.setState({ appUrl })
}

let previousClient: any = null
let previousServer: any = null

type CompilerDiagnosticsWithFile = {
  errors: { file: string | undefined; message: string }[] | null
  warnings: { file: string | undefined; message: string }[] | null
}

type CompilerDiagnostics = {
  errors: string[] | null
  warnings: string[] | null
}

type WebpackStatus =
  | { loading: true }
  | ({
      loading: false
      typeChecking: boolean
    } & CompilerDiagnostics)

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
  amp: AmpPageStatus
}

enum WebpackStatusPhase {
  COMPILING = 1,
  COMPILED_WITH_ERRORS = 2,
  TYPE_CHECKING = 3,
  COMPILED_WITH_WARNINGS = 4,
  COMPILED = 5,
}

function getWebpackStatusPhase(status: WebpackStatus): WebpackStatusPhase {
  if (status.loading) {
    return WebpackStatusPhase.COMPILING
  }
  if (status.errors) {
    return WebpackStatusPhase.COMPILED_WITH_ERRORS
  }
  if (status.typeChecking) {
    return WebpackStatusPhase.TYPE_CHECKING
  }
  if (status.warnings) {
    return WebpackStatusPhase.COMPILED_WITH_WARNINGS
  }
  return WebpackStatusPhase.COMPILED
}

export function formatAmpMessages(amp: AmpPageStatus) {
  let output = chalk.bold('Amp Validation') + '\n\n'
  let messages: string[][] = []

  const chalkError = chalk.red('error')
  function ampError(page: string, error: AmpStatus) {
    messages.push([page, chalkError, error.message, error.specUrl || ''])
  }

  const chalkWarn = chalk.yellow('warn')
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

const buildStore = createStore<BuildStatusStore>()

buildStore.subscribe(state => {
  const { amp, client, server } = state

  const [{ status }] = [
    { status: client, phase: getWebpackStatusPhase(client) },
    { status: server, phase: getWebpackStatusPhase(server) },
  ].sort((a, b) => a.phase.valueOf() - b.phase.valueOf())

  const { bootstrap: bootstrapping, appUrl } = consoleStore.getState()
  if (bootstrapping && status.loading) {
    return
  }

  let partialState: Partial<OutputState> = {
    bootstrap: false,
    appUrl: appUrl!,
  }

  if (status.loading) {
    consoleStore.setState(
      { ...partialState, loading: true } as OutputState,
      true
    )
  } else {
    let { errors, warnings, typeChecking } = status

    if (errors == null) {
      if (typeChecking) {
        consoleStore.setState(
          {
            ...partialState,
            loading: false,
            typeChecking: true,
            errors,
            warnings,
          } as OutputState,
          true
        )
        return
      }

      if (Object.keys(amp).length > 0) {
        warnings = (warnings || []).concat(formatAmpMessages(amp))
        if (!warnings.length) warnings = null
      }
    }

    consoleStore.setState(
      {
        ...partialState,
        loading: false,
        typeChecking: false,
        errors,
        warnings,
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
        .filter(k => k !== page)
        .sort()
        .reduce((a, c) => ((a[c] = amp[c]), a), {} as any),
    })
    return
  }

  const newAmp: AmpPageStatus = { ...amp, [page]: { errors, warnings } }
  buildStore.setState({
    amp: Object.keys(newAmp)
      .sort()
      .reduce((a, c) => ((a[c] = newAmp[c]), a), {} as any),
  })
}

export function watchCompilers(
  client: any,
  server: any,
  enableTypeCheckingOnClient: boolean,
  onTypeChecked: (diagnostics: CompilerDiagnostics) => void
) {
  if (previousClient === client && previousServer === server) {
    return
  }

  buildStore.setState({
    client: { loading: true },
    server: { loading: true },
  })

  function tapCompiler(
    key: string,
    compiler: any,
    hasTypeChecking: boolean,
    onEvent: (status: WebpackStatus) => void
  ) {
    let tsMessagesPromise: Promise<CompilerDiagnosticsWithFile> | undefined
    let tsMessagesResolver: (diagnostics: CompilerDiagnosticsWithFile) => void

    compiler.hooks.invalid.tap(`NextJsInvalid-${key}`, () => {
      tsMessagesPromise = undefined
      onEvent({ loading: true })
    })

    if (hasTypeChecking) {
      const typescriptFormatter = createCodeframeFormatter({})

      compiler.hooks.beforeCompile.tap(`NextJs-${key}-StartTypeCheck`, () => {
        tsMessagesPromise = new Promise(resolve => {
          tsMessagesResolver = msgs => resolve(msgs)
        })
      })

      forkTsCheckerWebpackPlugin
        .getCompilerHooks(compiler)
        .receive.tap(
          `NextJs-${key}-afterTypeScriptCheck`,
          (diagnostics: NormalizedMessage[], lints: NormalizedMessage[]) => {
            const allMsgs = [...diagnostics, ...lints]
            const format = (message: NormalizedMessage) =>
              typescriptFormatter(message, true)

            const errors = allMsgs
              .filter(msg => msg.severity === 'error')
              .map(d => ({
                file: (d.file || '').replace(/\\/g, '/'),
                message: format(d),
              }))
            const warnings = allMsgs
              .filter(msg => msg.severity === 'warning')
              .map(d => ({
                file: (d.file || '').replace(/\\/g, '/'),
                message: format(d),
              }))

            tsMessagesResolver({
              errors: errors.length ? errors : null,
              warnings: warnings.length ? warnings : null,
            })
          }
        )
    }

    compiler.hooks.done.tap(`NextJsDone-${key}`, (stats: any) => {
      buildStore.setState({ amp: {} })

      const { errors, warnings } = formatWebpackMessages(
        stats.toJson({ all: false, warnings: true, errors: true })
      )

      const hasErrors = errors && errors.length
      const hasWarnings = warnings && warnings.length

      onEvent({
        loading: false,
        typeChecking: hasTypeChecking,
        errors: hasErrors ? errors : null,
        warnings: hasWarnings ? warnings : null,
      })

      const typePromise = tsMessagesPromise

      if (!hasErrors && typePromise) {
        typePromise.then(typeMessages => {
          if (typePromise !== tsMessagesPromise) {
            // a new compilation started so we don't care about this
            return
          }

          const reportFiles = stats.compilation.modules
            .map((m: any) => (m.resource || '').replace(/\\/g, '/'))
            .filter(Boolean)

          let filteredErrors = typeMessages.errors
            ? typeMessages.errors
                .filter(({ file }) => file && reportFiles.includes(file))
                .map(({ message }) => message)
            : null
          if (filteredErrors && filteredErrors.length < 1) {
            filteredErrors = null
          }
          let filteredWarnings = typeMessages.warnings
            ? typeMessages.warnings
                .filter(({ file }) => file && reportFiles.includes(file))
                .map(({ message }) => message)
            : null
          if (filteredWarnings && filteredWarnings.length < 1) {
            filteredWarnings = null
          }

          stats.compilation.errors.push(...(filteredErrors || []))
          stats.compilation.warnings.push(...(filteredWarnings || []))
          onTypeChecked({
            errors: stats.compilation.errors.length
              ? stats.compilation.errors
              : null,
            warnings: stats.compilation.warnings.length
              ? stats.compilation.warnings
              : null,
          })

          onEvent({
            loading: false,
            typeChecking: false,
            errors: filteredErrors,
            warnings: hasWarnings
              ? [...warnings, ...(filteredWarnings || [])]
              : filteredWarnings,
          })
        })
      }
    })
  }

  tapCompiler('client', client, enableTypeCheckingOnClient, status =>
    buildStore.setState({ client: status })
  )
  tapCompiler('server', server, false, status =>
    buildStore.setState({ server: status })
  )

  previousClient = client
  previousServer = server
}
