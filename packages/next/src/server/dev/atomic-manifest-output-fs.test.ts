import fs from 'fs'
import os from 'os'
import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import {
  createAtomicManifestOutputFileSystem,
  isManifestFile,
} from './atomic-manifest-output-fs'

type OutputFileSystem = NonNullable<webpack.Compiler['outputFileSystem']>

function writeWith(
  outputFs: OutputFileSystem,
  filePath: string,
  content: string | Buffer
) {
  return new Promise<NodeJS.ErrnoException | null | undefined>((resolve) => {
    outputFs.writeFile(filePath, content, resolve)
  })
}

describe('isManifestFile', () => {
  it.each([
    'build-manifest.json',
    'fallback-build-manifest.json',
    'react-loadable-manifest.json',
    'server/next-font-manifest.json',
    'server/next-font-manifest.js',
    'server/app/_not-found/page_client-reference-manifest.js',
    'server/server-reference-manifest.json',
    'server/server-reference-manifest.js',
    'server/middleware-manifest.json',
    'server/middleware-build-manifest.js',
    'server/pages-manifest.json',
    'server/app-paths-manifest.json',
    'server/interception-route-rewrite-manifest.js',
    'server/subresource-integrity-manifest.json',
    'dynamic-css-manifest.json',
  ])('treats %s as a manifest', (file) => {
    expect(isManifestFile(path.join('/project/.next/dev', file))).toBe(true)
  })

  it.each([
    'server/app/page.js',
    'server/webpack-runtime.js',
    'static/chunks/main.js',
    'static/webpack/abc.webpack.hot-update.json',
    'server/manifest/page.js',
  ])('does not treat %s as a manifest', (file) => {
    expect(isManifestFile(path.join('/project/.next/dev', file))).toBe(false)
  })
})

describe('createAtomicManifestOutputFileSystem', () => {
  let dir: string
  // The real disk file system, standing in for webpack's graceful-fs.
  const baseFs = fs as unknown as OutputFileSystem

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-manifest-'))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes manifest buffers byte for byte', async () => {
    const outputFs = createAtomicManifestOutputFileSystem(baseFs)
    const target = path.join(dir, 'build-manifest.json')
    const bytes = Buffer.from([0x7b, 0xff, 0x00, 0xfe, 0x7d])

    expect(await writeWith(outputFs, target, bytes)).toBeNull()
    expect(fs.readFileSync(target).equals(bytes)).toBe(true)
    expect(fs.readdirSync(dir)).toEqual(['build-manifest.json'])
  })

  it('never exposes a partially written manifest', async () => {
    const outputFs = createAtomicManifestOutputFileSystem(baseFs)
    const target = path.join(dir, 'build-manifest.json')
    fs.writeFileSync(target, '{"old":true}')

    const realRenameSync = fs.renameSync
    let contentAtRename: string | undefined
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      // The new content is fully written to the temp file, and the target
      // still has the complete old content until the rename replaces it.
      contentAtRename = fs.readFileSync(target, 'utf8')
      expect(fs.readFileSync(from, 'utf8')).toBe('{"new":true}')
      realRenameSync(from, to)
    })

    expect(await writeWith(outputFs, target, '{"new":true}')).toBeNull()
    expect(contentAtRename).toBe('{"old":true}')
    expect(fs.readFileSync(target, 'utf8')).toBe('{"new":true}')
    expect(fs.readdirSync(dir)).toEqual(['build-manifest.json'])
  })

  it('reports a failed write once and leaves no temp file behind', async () => {
    const outputFs = createAtomicManifestOutputFileSystem(baseFs)
    const target = path.join(dir, 'build-manifest.json')
    fs.writeFileSync(target, '{"old":true}')
    jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('rename failed'), { code: 'EIO' })
    })

    const callback = jest.fn()
    outputFs.writeFile(target, '{"new":true}', callback)
    await new Promise((resolve) => setImmediate(resolve))

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({ code: 'EIO' })
    expect(fs.readFileSync(target, 'utf8')).toBe('{"old":true}')
    expect(fs.readdirSync(dir)).toEqual(['build-manifest.json'])
  })

  it('reports a missing directory through the callback', async () => {
    const outputFs = createAtomicManifestOutputFileSystem(baseFs)
    const err = await writeWith(
      outputFs,
      path.join(dir, 'missing', 'build-manifest.json'),
      '{}'
    )
    expect(err).toMatchObject({ code: 'ENOENT' })
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('does not call back twice when the callback throws', () => {
    const outputFs = createAtomicManifestOutputFileSystem(baseFs)
    const target = path.join(dir, 'build-manifest.json')
    const callback = jest.fn(() => {
      throw new Error('callback failed')
    })
    const ticks: Array<() => void> = []
    jest
      .spyOn(process, 'nextTick')
      .mockImplementation((fn: any, ...args: any[]) => {
        ticks.push(() => fn(...args))
      })

    outputFs.writeFile(target, '{}', callback)
    expect(callback).not.toHaveBeenCalled()
    expect(ticks).toHaveLength(1)
    expect(() => ticks[0]()).toThrow('callback failed')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('delegates non-manifest writes and other methods', async () => {
    const writeFile = jest.fn(
      (_file: string, _content: unknown, callback: (err: null) => void) =>
        callback(null)
    )
    const mkdir = jest.fn()
    const original = { writeFile, mkdir } as unknown as OutputFileSystem
    const outputFs = createAtomicManifestOutputFileSystem(original)

    const chunk = path.join(dir, 'static', 'chunks', 'main.js')
    expect(await writeWith(outputFs, chunk, 'code')).toBeNull()
    expect(writeFile).toHaveBeenCalledWith(chunk, 'code', expect.any(Function))
    expect(outputFs.mkdir).toBe(mkdir)

    // Manifests bypass the original `writeFile`.
    const manifest = path.join(dir, 'build-manifest.json')
    expect(await writeWith(outputFs, manifest, '{}')).toBeNull()
    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(fs.readFileSync(manifest, 'utf8')).toBe('{}')
  })

  it('does not modify the original file system', () => {
    const writeFile = jest.fn()
    const original = { writeFile } as unknown as OutputFileSystem
    const outputFs = createAtomicManifestOutputFileSystem(original)

    expect(outputFs).not.toBe(original)
    expect(original.writeFile).toBe(writeFile)
    expect(Object.keys(original)).toEqual(['writeFile'])
  })
})
