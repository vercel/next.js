import { spawn } from 'child_process'
import fetch from 'node-fetch'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  promises as fs,
} from 'fs'
import treeKill from 'tree-kill'

async function killApp(instance) {
  await new Promise((resolve, reject) => {
    treeKill(instance.pid, (err) => {
      if (err) {
        if (
          process.platform === 'win32' &&
          typeof err.message === 'string' &&
          (err.message.includes(`no running instance of the task`) ||
            err.message.includes(`not found`))
        ) {
          // Windows throws an error if the process is already stopped
          //
          // Command failed: taskkill /pid 6924 /T /F
          // ERROR: The process with PID 6924 (child process of PID 6736) could not be terminated.
          // Reason: There is no running instance of the task.
          return resolve()
        }
        return reject(err)
      }

      resolve()
    })
  })
}

class File {
  constructor(path) {
    this.path = path
    this.originalContent = existsSync(this.path)
      ? readFileSync(this.path, 'utf8')
      : null
  }

  write(content) {
    if (!this.originalContent) {
      this.originalContent = content
    }
    writeFileSync(this.path, content, 'utf8')
  }

  replace(pattern, newValue) {
    const currentContent = readFileSync(this.path, 'utf8')
    if (pattern instanceof RegExp) {
      if (!pattern.test(currentContent)) {
        throw new Error(
          `Failed to replace content.\n\nPattern: ${pattern.toString()}\n\nContent: ${currentContent}`
        )
      }
    } else if (typeof pattern === 'string') {
      if (!currentContent.includes(pattern)) {
        throw new Error(
          `Failed to replace content.\n\nPattern: ${pattern}\n\nContent: ${currentContent}`
        )
      }
    } else {
      throw new Error(`Unknown replacement attempt type: ${pattern}`)
    }

    const newContent = currentContent.replace(pattern, newValue)
    this.write(newContent)
  }

  prepend(line) {
    const currentContent = readFileSync(this.path, 'utf8')
    this.write(line + '\n' + currentContent)
  }

  delete() {
    unlinkSync(this.path)
  }

  restore() {
    this.write(this.originalContent)
  }
}

function runNextCommandDev(argv, opts = {}) {
  const nextBin = '../../node_modules/.bin/next'
  const cwd = process.cwd()
  const env = {
    ...process.env,
    NODE_ENV: undefined,
    __NEXT_TEST_MODE: 'true',
    ...opts.env,
  }

  const nodeArgs = opts.nodeArgs || []
  return new Promise((resolve, reject) => {
    const instance = spawn(
      'node',
      [...nodeArgs, '--no-deprecation', nextBin, ...argv],
      {
        cwd,
        env,
      }
    )
    let didResolve = false

    function handleStdout(data) {
      const message = data.toString()
      const bootupMarkers = {
        dev: /compiled .*successfully/i,
        start: /started server/i,
      }
      if (
        (opts.bootupMarker && opts.bootupMarker.test(message)) ||
        bootupMarkers[opts.nextStart ? 'start' : 'dev'].test(message)
      ) {
        if (!didResolve) {
          didResolve = true
          resolve(instance)
        }
      }

      if (typeof opts.onStdout === 'function') {
        opts.onStdout(message)
      }

      if (opts.stdout !== false) {
        process.stdout.write(message)
      }
    }

    function handleStderr(data) {
      const message = data.toString()
      if (typeof opts.onStderr === 'function') {
        opts.onStderr(message)
      }

      if (opts.stderr !== false) {
        process.stderr.write(message)
      }
    }

    instance.stdout.on('data', handleStdout)
    instance.stderr.on('data', handleStderr)

    instance.on('close', () => {
      instance.stdout.removeListener('data', handleStdout)
      instance.stderr.removeListener('data', handleStderr)
      if (!didResolve) {
        didResolve = true
        resolve()
      }
    })

    instance.on('error', (err) => {
      reject(err)
    })
  })
}

function waitFor(millis) {
  return new Promise((resolve) => setTimeout(resolve, millis))
}

async function main() {
  await fs.rmDir('.next', { recursive: true })
  const file = new File('pages/index.jsx')
  try {
    const instance = await runNextCommandDev(['dev', '--port', '3000'])
    const res = await fetch('http://localhost:3000/')
    if (res.status !== 200) {
      throw new Error('Fetching / failed')
    }

    await waitFor(3000)

    file.prepend('// First edit')

    await waitFor(5000)

    file.prepend('// Second edit')

    await waitFor(5000)

    file.prepend('// Third edit')

    await waitFor(5000)

    await killApp(instance)
    await fs.rmDir('.next', { recursive: true })
  } finally {
    file.restore()
  }
}

main()
