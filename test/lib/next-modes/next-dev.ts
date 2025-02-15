import spawn from 'cross-spawn'
import { Span } from 'next/dist/trace'
import { NextInstance } from './base'
import { getTurbopackFlag } from '../turbo'
import { retry, waitFor } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

export class NextDevInstance extends NextInstance {
  private _cliOutput: string = ''

  public get buildId() {
    return 'development'
  }

  public async setup(parentSpan: Span) {
    super.setup(parentSpan)
    await super.createTestDir({ parentSpan })
  }

  public get cliOutput() {
    return this._cliOutput || ''
  }

  public async start(useDirArg: boolean = false) {
    if (this.childProcess) {
      throw new Error('next already started')
    }

    const useTurbo =
      !process.env.TEST_WASM &&
      ((this as any).turbo || (this as any).experimentalTurbo)

    let startArgs = [
      'pnpm',
      'next',
      useTurbo ? getTurbopackFlag() : undefined,
      useDirArg && this.testDir,
    ].filter(Boolean) as string[]

    if (this.startCommand) {
      startArgs = this.startCommand.split(' ')
    }

    if (this.startOptions) {
      startArgs.push(...this.startOptions)
    }

    if (process.env.NEXT_SKIP_ISOLATE) {
      // without isolation yarn can't be used and pnpm must be used instead
      if (startArgs[0] === 'yarn') {
        startArgs[0] = 'pnpm'
      }
    }

    console.log('running', startArgs.join(' '))
    await new Promise<void>((resolve, reject) => {
      try {
        this.childProcess = spawn(startArgs[0], startArgs.slice(1), {
          cwd: useDirArg ? process.cwd() : this.testDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false,
          env: {
            ...process.env,
            ...this.env,
            NODE_ENV: this.env.NODE_ENV || ('' as any),
            PORT: this.forcedPort || '0',
            __NEXT_TEST_MODE: 'e2e',
            __NEXT_TEST_WITH_DEVTOOL: '1',
          },
        })

        this._cliOutput = ''

        this.childProcess.stdout.on('data', (chunk) => {
          const msg = chunk.toString()
          if (!process.env.CI) process.stdout.write(chunk)
          this._cliOutput += msg
          this.emit('stdout', [msg])
        })
        this.childProcess.stderr.on('data', (chunk) => {
          const msg = chunk.toString()
          if (!process.env.CI) process.stderr.write(chunk)
          this._cliOutput += msg
          this.emit('stderr', [msg])
        })

        this.childProcess.on('close', (code, signal) => {
          if (this.isStopping) return
          if (code || signal) {
            require('console').error(
              `next dev exited unexpectedly with code/signal ${code || signal}`
            )
          }
        })

        const serverReadyTimeoutId = this.setServerReadyTimeout(reject)

        const readyCb = (msg) => {
          const resolveServer = () => {
            clearTimeout(serverReadyTimeoutId)
            try {
              this._parsedUrl = new URL(this._url)
            } catch (err) {
              reject({
                err,
                msg,
              })
            }
            // server might reload so we keep listening
            resolve()
          }

          const colorStrippedMsg = stripAnsi(msg)
          if (colorStrippedMsg.includes('- Local:')) {
            this._url = msg
              .split('\n')
              .find((line) => line.includes('- Local:'))
              .split(/\s*- Local:/)
              .pop()
              .trim()
          }

          if (this.serverReadyPattern.test(colorStrippedMsg)) {
            resolveServer()
          }
        }
        this.on('stdout', readyCb)
      } catch (err) {
        require('console').error(`Failed to run ${startArgs.join(' ')}`, err)
        setTimeout(() => process.exit(1), 0)
      }
    })
  }

  private async handleDevWatchDelayBeforeChange(filename: string) {
    // This is a temporary workaround for turbopack starting watching too late.
    // So we delay file changes by 500ms to give it some time
    // to connect the WebSocket and start watching.
    if (process.env.TURBOPACK) {
      require('console').log('fs dev delay before', filename)
      await waitFor(500)
    }
  }

  private async handleDevWatchDelayAfterChange(filename: string) {
    // to help alleviate flakiness with tests that create
    // dynamic routes // and then request it we give a buffer
    // of 500ms to allow WatchPack to detect the changed files
    // TODO: replace this with an event directly from WatchPack inside
    // router-server for better accuracy
    if (filename.startsWith('app/') || filename.startsWith('pages/')) {
      require('console').log('fs dev delay', filename)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  public override async patchFile(
    filename: string,
    content: string | ((content: string) => string),
    runWithTempContent?: (context: { newFile: boolean }) => Promise<void>
  ) {
    await this.handleDevWatchDelayBeforeChange(filename)
    try {
      const cliOutputLengthBefore = this.cliOutput.length
      const isServerRunning = this.childProcess && !this.isStopping

      const detectServerRestart = async () => {
        await retry(async () => {
          const isServerReady = this.serverReadyPattern.test(
            this.cliOutput.slice(cliOutputLengthBefore)
          )
          if (isServerRunning && !isServerReady) {
            throw new Error('Server has not finished restarting.')
          }
        }, 5000)
      }

      const waitServerToBeReadyAfterPatchFile = async () => {
        if (!isServerRunning) {
          return
        }

        // If the patch file is a next.config.js, we ignore the delay and wait server restart
        if (filename.startsWith('next.config')) {
          await detectServerRestart()
          return
        }

        if (this.patchFileDelay > 0) {
          console.warn(
            `Applying patch delay of ${this.patchFileDelay}ms. Note: Introducing artificial delays is generally discouraged, as it may affect test reliability. However, this delay is configurable on a per-test basis.`
          )
          await waitFor(this.patchFileDelay)
          return
        }
      }

      try {
        return await super.patchFile(
          filename,
          content,
          runWithTempContent
            ? async (...args) => {
                await waitServerToBeReadyAfterPatchFile()

                return runWithTempContent(...args)
              }
            : undefined
        )
      } finally {
        // It's intentional: when runWithTempContent is defined, we wait twice: once for the patch,
        // and once for the restore of the original file

        await waitServerToBeReadyAfterPatchFile()
      }
    } finally {
      await this.handleDevWatchDelayAfterChange(filename)
    }
  }

  public override async renameFile(filename: string, newFilename: string) {
    await this.handleDevWatchDelayBeforeChange(filename)
    await super.renameFile(filename, newFilename)
    await this.handleDevWatchDelayAfterChange(filename)
  }

  public override async renameFolder(
    foldername: string,
    newFoldername: string
  ) {
    await this.handleDevWatchDelayBeforeChange(foldername)
    await super.renameFolder(foldername, newFoldername)
    await this.handleDevWatchDelayAfterChange(foldername)
  }

  public override async deleteFile(filename: string) {
    await this.handleDevWatchDelayBeforeChange(filename)
    await super.deleteFile(filename)
    await this.handleDevWatchDelayAfterChange(filename)
  }
}
