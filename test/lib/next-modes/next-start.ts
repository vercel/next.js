import path from 'path'
import fs from 'fs-extra'
import { NextInstance } from './base'
import { spawn, SpawnOptions } from 'child_process'

export class NextStartInstance extends NextInstance {
  private _buildId: string
  private _cliOutput: string
  private spawnOpts: SpawnOptions

  public get buildId() {
    return this._buildId
  }

  public get cliOutput() {
    return this._cliOutput
  }

  public async setup() {
    await super.createTestDir()
  }

  private handleStdio = (childProcess) => {
    childProcess.stdout.on('data', (chunk) => {
      const msg = chunk.toString()
      process.stdout.write(chunk)
      this._cliOutput += msg
      this.emit('stdout', [msg])
    })
    childProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString()
      process.stderr.write(chunk)
      this._cliOutput += msg
      this.emit('stderr', [msg])
    })
  }

  public async start() {
    if (this.childProcess) {
      throw new Error('next already started')
    }
    this.spawnOpts = {
      cwd: this.testDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: {
        ...process.env,
        NODE_ENV: '' as any,
        __NEXT_TEST_MODE: '1',
        __NEXT_RAND_PORT: '1',
      },
    }
    let buildArgs = ['yarn', 'next', 'build']
    let startArgs = ['yarn', 'next', 'start']

    if (this.buildCommand) {
      buildArgs = this.buildCommand.split(' ')
    }
    if (this.startCommand) {
      startArgs = this.startCommand.split(' ')
    }

    await new Promise<void>((resolve, reject) => {
      console.log('running', buildArgs.join(' '))
      this.childProcess = spawn(
        buildArgs[0],
        buildArgs.slice(1),
        this.spawnOpts
      )
      this.handleStdio(this.childProcess)
      this.childProcess.on('exit', (code, signal) => {
        if (code || signal)
          reject(
            new Error(`next build failed with code/signal ${code || signal}`)
          )
        else resolve()
      })
    })

    this._buildId = (
      await fs.readFile(
        path.join(
          this.testDir,
          this.nextConfig?.distDir || '.next',
          'BUILD_ID'
        ),
        'utf8'
      )
    ).trim()

    console.log('running', startArgs.join(' '))

    await new Promise<void>((resolve) => {
      this.childProcess = spawn(
        startArgs[0],
        startArgs.slice(1),
        this.spawnOpts
      )
      this.handleStdio(this.childProcess)

      this.childProcess.on('close', (code, signal) => {
        if (this.isStopping) return
        if (code || signal) {
          throw new Error(
            `next start exited unexpectedly with code/signal ${code || signal}`
          )
        }
      })

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

  public async export() {
    return new Promise((resolve) => {
      const curOutput = this._cliOutput.length
      const exportArgs = ['yarn', 'next', 'export']

      if (this.childProcess) {
        throw new Error(
          `can not run export while server is running, use next.stop() first`
        )
      }
      console.log('running', exportArgs.join(' '))

      this.childProcess = spawn(
        exportArgs[0],
        exportArgs.slice(1),
        this.spawnOpts
      )
      this.handleStdio(this.childProcess)

      this.childProcess.on('exit', (code, signal) => {
        this.childProcess = undefined
        resolve({
          exitCode: signal || code,
          cliOutput: this.cliOutput.slice(curOutput),
        })
      })
    })
  }
}
