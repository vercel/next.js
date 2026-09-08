import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { SwcPool } from '../../../packages/next/build-tools/swc-pool'
import { copyCache } from '../../../packages/next/build-tools/swc-cache'
import {
  loadFiles,
  serializeFile,
} from '../../../packages/next/build-tools/artifacts'

describe('SWC build worker', () => {
  const pool = new SwcPool()
  afterAll(() => pool.close())
  it('passes cached SWC outputs and error artifacts directly to target by handle', async () => {
    const cwd = join(__dirname, '../../../packages/next')
    const child = spawn(
      process.execPath,
      [
        '--require',
        join(__dirname, 'fixtures/no-bundlers.cjs'),
        'build-tools/worker.js',
      ],
      {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    )
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    const writes: any[] = []
    const send = (message: unknown) =>
      child.stdin.write(JSON.stringify(message) + '\n')
    try {
      await new Promise<void>((resolve, reject) => {
        let complete = false
        createInterface({ input: child.stdout }).on('line', (line) => {
          try {
            if (!line) return
            expect(line.startsWith('__NEXT_TASKR__')).toBe(true)
            const message = JSON.parse(line.slice('__NEXT_TASKR__'.length))
            if (message.error) throw new Error(message.error)
            if (message.call) {
              let value: unknown = null
              switch (message.args.kind) {
                case 'read':
                  expect(message.args.artifacts).toBe(true)
                  value = message.args.paths.map(
                    (_: string, index: number) => index + 1
                  )
                  break
                case 'transforms':
                  expect(message.args.artifacts).toBe(true)
                  for (const input of message.args.inputs) {
                    for (const file of input.files) {
                      expect(typeof file.artifact).toBe('number')
                      expect(file).not.toHaveProperty('data')
                    }
                  }
                  value = [
                    {
                      files: [{ dir: 'src/bin', base: 'next', artifact: 100 }],
                      errors: [{ name: 'code.json', artifact: 101 }],
                    },
                  ]
                  break
                case 'write':
                  for (const file of message.args.files) {
                    expect(file).not.toHaveProperty('data')
                    writes.push(file)
                  }
                  break
                default:
                  throw new Error(
                    `Unexpected byte access: ${message.args.kind}`
                  )
              }
              send({ reply: message.call, value })
            } else if (message.request === 1) {
              send({ id: 2, kind: 'shutdown', args: {} })
            } else {
              complete = true
              child.stdin.end()
            }
          } catch (error) {
            reject(error)
          }
        })
        child.once('error', reject)
        child.once('exit', (code) => {
          if (code === 0 && complete) resolve()
          else
            reject(
              new Error(`Worker exited before completing: ${code}\n${stderr}`)
            )
        })
        send({ id: 1, kind: 'task', args: { name: 'bin', options: {} } })
      })
      expect(writes).toEqual([
        { path: join(cwd, '.errors/code.json'), artifact: 101 },
        {
          path: join(cwd, 'dist/bin/next'),
          dir: 'src/bin',
          base: 'next',
          mode: '0755',
          artifact: 100,
        },
      ])
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise<void>((resolve) => {
          child.once('exit', () => resolve())
          child.kill()
        })
      }
    }
  }, 30000)

  if (process.platform !== 'win32') {
    it('keeps subprocess logs separate from large protocol messages', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'next-taskr-protocol-'))
      const stop = join(directory, 'stop')
      await writeFile(
        join(directory, 'pnpm'),
        `#!/usr/bin/env node\nrequire(${JSON.stringify(join(__dirname, 'fixtures/pnpm.cjs'))})\n`,
        { mode: 0o755 }
      )
      const child = spawn(process.execPath, ['build-tools/worker.js'], {
        cwd: join(__dirname, '../../../packages/next'),
        env: {
          ...process.env,
          PATH: directory + ':' + process.env.PATH,
          NEXT_TASKR_TEST_STOP: stop,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const bytes = Buffer.alloc(3 * 1024 * 1024, 'x').toString('base64')
      let outgoing = Promise.resolve()
      const send = (message: unknown) => {
        outgoing = outgoing.then(
          () =>
            new Promise<void>((resolve, reject) => {
              child.stdin.write(JSON.stringify(message) + '\n', (error) =>
                error ? reject(error) : resolve()
              )
            })
        )
        return outgoing
      }
      try {
        await new Promise<void>((resolve, reject) => {
          let logging = false
          let pendingRead: any
          let complete = false
          const finished = new Set<number>()
          const replyRead = () => {
            if (!logging || !pendingRead) return
            const message = pendingRead
            pendingRead = undefined
            expect(message.args.artifacts.length).toBeGreaterThan(0)
            send({
              reply: message.call,
              value: message.args.artifacts.map((_: number, index: number) =>
                index ? '' : bytes
              ),
            }).catch(reject)
          }
          child.stderr.on('data', (chunk) => {
            if (chunk.toString().includes('typescript log')) {
              logging = true
              replyRead()
            }
          })
          createInterface({ input: child.stdout }).on('line', (line) => {
            ;(async () => {
              if (!line) return
              expect(line.startsWith('__NEXT_TASKR__')).toBe(true)
              const message = JSON.parse(line.slice('__NEXT_TASKR__'.length))
              if (message.error) throw new Error(message.error)
              if (message.call) {
                if (message.args.kind === 'read') {
                  expect(message.args.artifacts).toBe(true)
                  await send({
                    reply: message.call,
                    value: message.args.paths.map(
                      (_: string, index: number) => index + 1
                    ),
                  })
                } else if (message.args.kind === 'load') {
                  pendingRead = message
                  replyRead()
                } else {
                  expect(message.args.kind).toBe('write')
                  expect(
                    message.args.files.some(
                      (file: { data: string }) => file.data === bytes
                    )
                  ).toBe(true)
                  await writeFile(stop, '')
                  await send({ reply: message.call, value: null })
                }
              } else {
                finished.add(message.request)
                if (message.request === 3) {
                  complete = true
                  child.stdin.end()
                } else if (finished.has(1) && finished.has(2)) {
                  await send({ id: 3, kind: 'shutdown', args: {} })
                }
              }
            })().catch(reject)
          })
          child.once('error', reject)
          child.once('exit', (code) => {
            if (code === 0 && complete) resolve()
            else reject(new Error(`Worker exited before completing: ${code}`))
          })
          send({
            id: 1,
            kind: 'task',
            args: { name: 'copy_docs', options: {} },
          }).catch(reject)
          send({
            id: 2,
            kind: 'task',
            args: { name: 'generate_types', options: {} },
          }).catch(reject)
        })
      } finally {
        await writeFile(stop, '')
        if (child.exitCode === null && child.signalCode === null) {
          await new Promise<void>((resolve) => {
            child.once('exit', () => resolve())
            child.kill()
          })
        }
        await rm(directory, { recursive: true, force: true })
      }
    }, 30000)
  }

  it('keeps metadata operations lazy and invalidates handles before JavaScript mutations', async () => {
    const file: any = { dir: 'src', base: 'input.js', artifact: 12 }
    expect(serializeFile({ ...file, dir: 'dist', base: 'renamed.js' })).toEqual(
      {
        dir: 'dist',
        base: 'renamed.js',
        artifact: 12,
      }
    )
    const request = jest.fn(async () => [
      Buffer.from('original').toString('base64'),
    ])
    await loadFiles([file], request)
    expect(request).toHaveBeenCalledWith({ kind: 'load', artifacts: [12] })
    expect(file.artifact).toBeUndefined()
    file.data[0] = 'O'.charCodeAt(0)
    expect(serializeFile(file).data).toBe(
      Buffer.from('Original').toString('base64')
    )
    file.data = 'replacement'
    expect(serializeFile(file).data).toBe(
      Buffer.from('replacement').toString('base64')
    )
    await loadFiles([file, { data: null }], request)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('isolates WASM cache writes and publishes complete new entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-taskr-cache-test-'))
    const shared = join(root, 'shared')
    const first = join(root, 'first')
    const second = join(root, 'second')
    try {
      await writeFile(join(root, 'known'), 'original')
      await copyCache(root, shared)
      await copyCache(shared, first)
      await copyCache(shared, second)
      await writeFile(join(first, 'known'), 'private')
      expect(await readFile(join(shared, 'known'), 'utf8')).toBe('original')
      const a = Buffer.alloc(1024 * 1024, 'a')
      const b = Buffer.alloc(1024 * 1024, 'b')
      await writeFile(join(first, 'new'), a)
      await writeFile(join(second, 'new'), b)
      await Promise.all([
        copyCache(first, shared, true),
        copyCache(second, shared, true),
      ])
      const published = await readFile(join(shared, 'new'))
      expect(published.equals(a) || published.equals(b)).toBe(true)
      expect(await readFile(join(shared, 'known'), 'utf8')).toBe('original')
      expect((await readdir(shared)).sort()).toEqual(['known', 'new'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns reproducible bytes using the current SWC emitter', async () => {
    const source = await readFile(join(__dirname, 'fixtures/error.ts'))
    const input = {
      options: ['server', {}],
      file: {
        dir: 'src/lib',
        base: 'taskr-fixture.ts',
        data: source.toString('base64'),
      },
    }
    const first = await pool.transform(input)
    const second = await pool.transform(input)
    expect(second).toEqual(first)
    expect(first.files.map((file) => file.base)).toEqual([
      'taskr-fixture.js',
      'taskr-fixture.js.map',
    ])
    expect(first.errors).toEqual([])
    expect(Buffer.from(first.files[0].data, 'base64').toString()).toContain(
      'next-taskr isolated error-code fixture'
    )
  })

  it('switches shared inputs safely across concurrent queued transforms', async () => {
    const source = Buffer.from('export const value: number = 1')
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => {
        const esm = index % 3 === 0
        return pool.transform({
          options: ['server', { esm }],
          file: {
            dir: 'src/lib',
            base: `taskr-fixture-${index}.ts`,
            data: source.toString('base64'),
          },
        })
      })
    )
    results.forEach((result, index) => {
      expect(result.files[0].base).toBe(`taskr-fixture-${index}.js`)
      expect(result.errors).toEqual([])
      expect(Buffer.from(result.files[0].data, 'base64').toString()).toMatch(
        index % 3 === 0 ? /\bexport\s/ : /Object\.defineProperty\(exports/
      )
    })
  })

  it('returns complete, reproducible artifacts for concurrent native batches', async () => {
    const files = Array.from({ length: 32 }, (_, index) => ({
      dir: 'src/lib',
      base: `batch-${index}.ts`,
      data: Buffer.from(`throw new Error('batch error ${index}')`).toString(
        'base64'
      ),
    }))
    const input = { files, options: ['server', {}] }
    const first = await pool.transform(input)
    const second = await pool.transform(input)
    expect(second).toEqual(first)
    expect(first.files.map((file) => file.base)).toEqual(
      files.flatMap((_, index) => [
        `batch-${index}.js`,
        `batch-${index}.js.map`,
      ])
    )
    expect(first.errors).toEqual([])
    for (let index = 0; index < files.length; index++) {
      expect(
        Buffer.from(first.files[index * 2].data, 'base64').toString()
      ).toContain(`batch error ${index}`)
    }
  })

  it('finishes a failed batch before accepting the next batch', async () => {
    const isolated = new SwcPool(1)
    const file = (base: string, source: string) => ({
      dir: 'src/lib',
      base,
      data: Buffer.from(source).toString('base64'),
    })
    try {
      await expect(
        isolated.transform({
          options: ['server', {}],
          files: [
            file('invalid.ts', 'const ='),
            ...Array.from({ length: 31 }, (_, index) =>
              file(`pending-${index}.ts`, `throw new Error('pending ${index}')`)
            ),
          ],
        })
      ).rejects.toThrow()
      const next = await isolated.transform({
        options: ['server', {}],
        file: file('valid.ts', 'export const value = 1'),
      })
      expect(next.errors).toEqual([])
      expect(next.files.map((file) => file.base)).toEqual([
        'valid.js',
        'valid.js.map',
      ])
    } finally {
      await isolated.close()
    }
  })
})
