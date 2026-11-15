import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadEnvConfig } from '../../packages/next-env/'

// A FIFO that serves its contents once and reads empty thereafter, as a
// drained pipe from a secret manager does. The writer loops on opening the
// FIFO for writing: the first open writes the contents, later opens close
// immediately, so the reader sees an empty file.
function startDrainingFifoWriter(fifoPath: string): ChildProcess {
  return spawn(
    process.execPath,
    [
      '-e',
      `
      const fs = require('fs')
      const fifoPath = process.argv[1]
      let first = true
      while (true) {
        const fd = fs.openSync(fifoPath, 'w')
        if (first) {
          fs.writeSync(fd, 'NEXT_TEST_FIFO_SECRET=once-only\\n')
          first = false
        }
        fs.closeSync(fd)
      }
      `,
      fifoPath,
    ],
    { stdio: 'ignore' }
  )
}

describe('fifo env reload', () => {
  it('keeps the previously loaded value when a forced reload reads nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'next-env-fifo-'))
    const fifoPath = join(dir, '.env')
    execSync(`mkfifo ${fifoPath}`)
    const writer = startDrainingFifoWriter(fifoPath)

    try {
      loadEnvConfig(dir)
      expect(process.env.NEXT_TEST_FIFO_SECRET).toBe('once-only')

      // What the dev bundler does on a .env watcher event.
      loadEnvConfig(dir, false, console, true)
      expect(process.env.NEXT_TEST_FIFO_SECRET).toBe('once-only')
    } finally {
      writer.kill('SIGKILL')
      delete process.env.NEXT_TEST_FIFO_SECRET
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('removes values when a regular .env file is emptied on reload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'next-env-plain-'))
    writeFileSync(join(dir, '.env'), 'NEXT_TEST_FIFO_SECRET=present\n')

    try {
      loadEnvConfig(dir, false, console, true)
      expect(process.env.NEXT_TEST_FIFO_SECRET).toBe('present')

      writeFileSync(join(dir, '.env'), '')
      loadEnvConfig(dir, false, console, true)
      expect(process.env.NEXT_TEST_FIFO_SECRET).toBeUndefined()
    } finally {
      delete process.env.NEXT_TEST_FIFO_SECRET
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('still replaces values when a forced reload reads new content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'next-env-plain-'))
    writeFileSync(join(dir, '.env'), 'NEXT_TEST_FIFO_SECRET=updated\n')

    try {
      loadEnvConfig(dir, false, console, true)
      expect(process.env.NEXT_TEST_FIFO_SECRET).toBe('updated')
    } finally {
      delete process.env.NEXT_TEST_FIFO_SECRET
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

export {}
