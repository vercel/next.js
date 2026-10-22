import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runTestProcess } from '../execution/process'
import { resolveCustomCoverageProvider } from './custom-runtime'
import type {
  CustomCoverageConfig,
  CustomCoverageFact,
  CustomCoverageRequest,
} from './custom-types'

/** Provider hooks run in a real owned realm, separate from compiler and files. */
export async function openCustomCoverageSession(options: {
  projectDir: string
  config: CustomCoverageConfig
  signal: AbortSignal
  onOutput?: (stream: 'stdout' | 'stderr', chunk: Buffer) => void
}) {
  options.signal.throwIfAborted()
  const provider = await resolveCustomCoverageProvider(
    options.projectDir,
    options.config.customProviderModule
  )
  const directory = await mkdtemp(join(tmpdir(), 'next-test-custom-coverage-'))
  let send!: (message: unknown) => Promise<void>
  let pending:
    | {
        type: string
        resolve(value: any): void
        reject(error: unknown): void
        timer: ReturnType<typeof setTimeout>
      }
    | undefined
  let closed = false
  let closing = false
  let certifiedClosed = false
  let retainPayloads = false
  let terminalError: unknown
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal.reason)
  options.signal.addEventListener('abort', cancel, { once: true })
  if (options.signal.aborted) cancel()
  const wait = (type: string) =>
    new Promise<any>((resolveWait, reject) => {
      if (pending || closed)
        return reject(new Error('Custom coverage session is unavailable.'))
      pending = {
        type,
        resolve: resolveWait,
        reject,
        timer: setTimeout(
          () =>
            controller.abort(new Error('Custom coverage provider timed out.')),
          30000
        ),
      }
    })
  const ready = wait('custom-coverage-ready')
  const exit = runTestProcess(require.resolve('./custom-worker'), {
    cwd: options.projectDir,
    env: process.env,
    input: { projectDir: options.projectDir, config: options.config, provider },
    signal: controller.signal,
    shutdownGraceMs: 1000,
    onReady(value) {
      send = value
    },
    onOutput: options.onOutput,
    onMessage(message: any) {
      if (message?.type === 'custom-coverage-failed') {
        const error = new Error(
          message.error?.message ?? 'Custom coverage provider failed.'
        )
        terminalError ??= error
        clearTimeout(pending?.timer)
        pending?.reject(error)
        pending = undefined
        controller.abort(error)
      } else if (pending && message?.type === pending.type) {
        const response = pending
        pending = undefined
        clearTimeout(response.timer)
        response.resolve(message)
      } else throw new Error('Unexpected custom coverage response.')
    },
  })
    .then(
      (result) => {
        certifiedClosed = true
        if (
          !(result.reason === 'cancelled' && options.signal.aborted) &&
          (!closing || result.reason !== 'exit' || result.code !== 0)
        )
          terminalError ??= new Error(
            `Custom coverage host ended before clean shutdown (${result.reason}).`
          )
      },
      (error) => {
        terminalError ??= error
      }
    )
    .finally(() => {
      closed = true
      clearTimeout(pending?.timer)
      pending?.reject(
        terminalError ?? new Error('Custom coverage host closed.')
      )
      pending = undefined
    })
  async function command(type: string, response: string, payload = {}) {
    if (terminalError) throw terminalError
    options.signal.throwIfAborted()
    const result = wait(response)
    try {
      await send({ type, ...payload })
    } catch (error) {
      controller.abort(error)
      await result.catch(() => {})
      throw error
    }
    return result
  }
  async function dispose(policy: { retainPayloads?: boolean } = {}) {
    // Closing this host proves nothing about an uncertain file-worker writer.
    retainPayloads ||= policy.retainPayloads === true
    if (!closed && !closing && !controller.signal.aborted) {
      try {
        closing = true
        await command('shutdown', 'custom-coverage-closed')
      } catch (error) {
        terminalError ??= error
        controller.abort(error)
      }
    }
    await exit
    options.signal.removeEventListener('abort', cancel)
    // A rejected process lease cannot certify that a writer is gone.
    if (certifiedClosed && !retainPayloads)
      await rm(directory, { recursive: true, force: true })
    if (terminalError) throw terminalError
  }
  try {
    const response = await ready
    const reportsDirectory = resolve(
      options.projectDir,
      options.config.reportsDirectory
    )
    if (response.reportsDirectory !== reportsDirectory)
      throw new Error('Custom coverage report path changed.')
    return {
      request: {
        version: 1,
        kind: 'custom',
        provider,
        reportsDirectory,
        coverageFilesDirectory: directory,
      } satisfies CustomCoverageRequest,
      async afterSuite(fact: CustomCoverageFact) {
        await command(
          'custom-coverage-suite',
          'custom-coverage-suite-received',
          {
            fact,
          }
        )
      },
      async finish(
        facts: CustomCoverageFact[],
        status: 'passed' | 'failed',
        allTestsRun: boolean
      ) {
        await command('custom-coverage-finish', 'custom-coverage-finished', {
          facts,
          status,
          allTestsRun,
        })
      },
      dispose,
    }
  } catch (error) {
    controller.abort(error)
    await dispose().catch(() => {})
    throw error
  }
}
export type CustomCoverageSession = Awaited<
  ReturnType<typeof openCustomCoverageSession>
>
