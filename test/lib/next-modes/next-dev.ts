import execa from 'execa'
import treeKill from 'tree-kill'
import { NextInstance } from './base'

export class NextDevInstance extends NextInstance {
  private childProcess: ReturnType<typeof execa>
  private _url: string

  public async setup() {
    await this.createTestDir()
  }
  public async start() {
    this.childProcess = execa('yarn', ['next'], {
      cwd: this.testDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: '',
        __NEXT_TEST_MODE: '1',
        __NEXT_RAND_PORT: '1',
      },
    }) as any as ReturnType<typeof execa>

    this.childProcess.stdout.on('data', (chunk) => {
      const msg = chunk.toString()
      process.stdout.write(chunk)
      this.emit('stdout', msg)
    })
    this.childProcess.stderr.on('data', (chunk) => {
      const msg = chunk.toString()
      process.stderr.write(chunk)
      this.emit('stderr', msg)
    })

    await new Promise((resolve) => {
      const readyCb = (msg) => {
        if (msg.includes('started server on') && msg.includes('url:')) {
          this._url = msg.split('url: ').pop().trim()
          this.off('stdout', readyCb)
        }
      }
      this.on('stdout', readyCb)
    })
  }
  public async destroy() {
    await new Promise<void>((resolve) => {
      treeKill(this.childProcess.pid, () => resolve())
    })
  }

  public url() {
    return this._url
  }
}
