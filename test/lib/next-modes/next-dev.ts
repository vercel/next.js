import spawn from 'cross-spawn'
import { Span } from 'next/src/trace'
import { NextInstance } from './base'
import { getTurbopackFlag } from '../turbo'
import stripAnsi from 'strip-ansi'

export class NextDevInstance extends NextInstance {
  private _cliOutput: string = ''

  public get buildId() {
    return 'development'
  }

  public async setup(parentSpan: Span) {
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
      'yarn',
      'next',
      useTurbo ? getTurbopackFlag() : undefined,
      useDirArg && this.testDir,
    ].filter(Boolean) as string[]

    if (this.startCommand) {
      startArgs = this.startCommand.split(' ')
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

        const readyCb = (msg) => {
          const resolveServer = () => {
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
            resolveServer()
          } else if (
            msg.includes('started server on') &&
            msg.includes('url:')
          ) {
            this._url = msg.split('url: ').pop().split(/\s/, 1)[0].trim()
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
}
