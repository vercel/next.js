import { spawn } from 'child_process'
import { NextInstance } from './base'

export class NextDevInstance extends NextInstance {
  private _cliOutput: string

  public get buildId() {
    return 'development'
  }

  public async setup() {
    await super.createTestDir()
  }

  public get cliOutput() {
    return this._cliOutput || ''
  }

  public async start() {
    if (this.childProcess) {
      throw new Error('next already started')
    }
    // we don't use yarn next here as yarn detaches itself from the
    // child process making it harder to kill all processes
    this.childProcess = spawn('node', ['node_modules/next/dist/bin/next'], {
      cwd: this.testDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        NODE_ENV: '',
        __NEXT_TEST_MODE: '1',
        __NEXT_RAND_PORT: '1',
        __NEXT_TEST_WITH_DEVTOOL: '1',
      },
    })

    this.childProcess.stdout.on('data', (chunk) => {
      const msg = chunk.toString()
      process.stdout.write(chunk)
      this._cliOutput += msg
      this.emit('stdout', [msg])
    })
    this.childProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString()
      process.stderr.write(chunk)
      this._cliOutput += msg
      this.emit('stderr', [msg])
    })

    this.childProcess.on('close', (code) => {
      if (code) {
        throw new Error(`next dev exited unexpectedly with code ${code}`)
      }
    })

    await new Promise<void>((resolve) => {
      const readyCb = (msg) => {
        if (msg.includes('started server on') && msg.includes('url:')) {
          this._url = msg.split('url: ').pop().trim()
          this._parsedUrl = new URL(this._url)
          this.off('stdout', readyCb)
          resolve()
        }
      }
      this.on('stdout', readyCb)
    })
  }
}
