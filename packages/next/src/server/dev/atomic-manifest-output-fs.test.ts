import fs from 'fs'
import os from 'os'
import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import {
  enableAtomicManifestWrites,
  isManifestFile,
} from './atomic-manifest-output-fs'

type Callback = (err?: NodeJS.ErrnoException | null) => void

function writeWith(compiler: any, filePath: string, content: string) {
  return new Promise<NodeJS.ErrnoException | null | undefined>((resolve) => {
    compiler.outputFileSystem.writeFile(filePath, Buffer.from(content), resolve)
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

describe('enableAtomicManifestWrites', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-manifest-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // The shared file system the wrapper delegates to.
  function createFileSystem(overrides: Record<string, any> = {}) {
    return {
      writeFile: jest.fn(fs.writeFile),
      rename: jest.fn(fs.rename),
      unlink: jest.fn(fs.unlink),
      mkdir: fs.mkdir,
      ...overrides,
    }
  }

  function createCompiler(
    outputFileSystem: Record<string, any> = createFileSystem(),
    options?: Parameters<typeof enableAtomicManifestWrites>[1]
  ) {
    const compiler = { outputFileSystem }
    enableAtomicManifestWrites(compiler as unknown as webpack.Compiler, options)
    return compiler
  }

  it('writes manifests to a temp file and renames it over the target', async () => {
    const shared = createFileSystem()
    const compiler = createCompiler(shared)
    const target = path.join(dir, 'next-font-manifest.json')
    fs.writeFileSync(target, '{"old":true}')

    expect(await writeWith(compiler, target, '{"new":true}')).toBeNull()

    expect(shared.writeFile).toHaveBeenCalledTimes(1)
    const tempPath = shared.writeFile.mock.calls[0][0] as string
    expect(tempPath).not.toBe(target)
    expect(path.dirname(tempPath)).toBe(dir)
    expect(shared.rename).toHaveBeenCalledWith(
      tempPath,
      target,
      expect.any(Function)
    )
    expect(fs.readFileSync(target, 'utf8')).toBe('{"new":true}')
    expect(fs.readdirSync(dir)).toEqual(['next-font-manifest.json'])
  })

  it('delegates other files to the original writeFile', async () => {
    const shared = createFileSystem()
    const compiler = createCompiler(shared)
    const target = path.join(dir, 'page.js')

    expect(await writeWith(compiler, target, 'chunk')).toBeNull()

    expect(shared.writeFile).toHaveBeenCalledWith(
      target,
      expect.anything(),
      expect.any(Function)
    )
    expect(shared.rename).not.toHaveBeenCalled()
    expect(fs.readFileSync(target, 'utf8')).toBe('chunk')
  })

  it('never exposes a partially written manifest to concurrent readers', async () => {
    let releaseRename!: () => void
    const renamePaused = new Promise<void>((resolve) => {
      releaseRename = resolve
    })
    let onRenameCalled!: () => void
    const renameCalled = new Promise<void>((resolve) => {
      onRenameCalled = resolve
    })
    const compiler = createCompiler(
      createFileSystem({
        rename: (from: string, to: string, cb: Callback) => {
          onRenameCalled()
          renamePaused.then(() => fs.rename(from, to, cb))
        },
      })
    )
    const target = path.join(dir, 'page_client-reference-manifest.js')
    const oldContent = 'globalThis.__RSC_MANIFEST = { old: true }'
    const newContent = 'globalThis.__RSC_MANIFEST = { new: true }'
    fs.writeFileSync(target, oldContent)

    const write = writeWith(compiler, target, newContent)

    // The new content is fully written to the temp file, but not yet renamed.
    await renameCalled
    expect(fs.readFileSync(target, 'utf8')).toBe(oldContent)

    releaseRename()
    expect(await write).toBeNull()
    expect(fs.readFileSync(target, 'utf8')).toBe(newContent)
  })

  it('removes the temp file and reports the error when the rename fails', async () => {
    const renameError = Object.assign(new Error('rename failed'), {
      code: 'ENOSPC',
    })
    const shared = createFileSystem({
      rename: jest.fn((_from: string, _to: string, cb: Callback) =>
        cb(renameError)
      ),
    })
    const compiler = createCompiler(shared)
    const target = path.join(dir, 'page_client-reference-manifest.js')

    expect(await writeWith(compiler, target, 'manifest')).toBe(renameError)

    const tempPath = shared.writeFile.mock.calls[0][0] as string
    expect(shared.unlink).toHaveBeenCalledWith(tempPath, expect.any(Function))
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('retries transient rename errors on Windows even if the target exists', async () => {
    let failures = 1
    const shared = createFileSystem({
      rename: jest.fn((from: string, to: string, cb: Callback) => {
        if (failures-- > 0) {
          return cb(Object.assign(new Error('locked'), { code: 'EPERM' }))
        }
        fs.rename(from, to, cb)
      }),
    })
    const compiler = createCompiler(shared, { platform: 'win32' })
    const target = path.join(dir, 'build-manifest.json')
    fs.writeFileSync(target, 'old')

    expect(await writeWith(compiler, target, 'new')).toBeNull()

    expect(shared.rename).toHaveBeenCalledTimes(2)
    expect(fs.readFileSync(target, 'utf8')).toBe('new')
  })

  it('does not retry rename errors on other platforms', async () => {
    const shared = createFileSystem({
      rename: jest.fn((_from: string, _to: string, cb: Callback) =>
        cb(Object.assign(new Error('locked'), { code: 'EPERM' }))
      ),
    })
    const compiler = createCompiler(shared, { platform: 'linux' })

    const err = await writeWith(
      compiler,
      path.join(dir, 'build-manifest.json'),
      'new'
    )

    expect(err?.code).toBe('EPERM')
    expect(shared.rename).toHaveBeenCalledTimes(1)
  })

  it('does not modify a file system shared between compilers', async () => {
    const shared = createFileSystem()
    const originalWriteFile = shared.writeFile
    const first = createCompiler(shared)
    const second = createCompiler(shared)

    expect(shared.writeFile).toBe(originalWriteFile)
    expect(first.outputFileSystem).not.toBe(shared)
    expect(second.outputFileSystem).not.toBe(shared)
    // Other methods are inherited from the shared file system.
    expect((first.outputFileSystem as any).mkdir).toBe(shared.mkdir)

    expect(
      await writeWith(second, path.join(dir, 'build-manifest.json'), '{}')
    ).toBeNull()
    // One temp write and one rename: the wrappers don't stack.
    expect(shared.writeFile).toHaveBeenCalledTimes(1)
    expect(shared.rename).toHaveBeenCalledTimes(1)
  })

  it('does not wrap a compiler twice', () => {
    const compiler = createCompiler()
    const wrapped = compiler.outputFileSystem
    enableAtomicManifestWrites(compiler as unknown as webpack.Compiler)
    expect(compiler.outputFileSystem).toBe(wrapped)
  })

  it('leaves output file systems without rename untouched', () => {
    const outputFileSystem = { writeFile: jest.fn() }
    const compiler = createCompiler(outputFileSystem)
    expect(compiler.outputFileSystem).toBe(outputFileSystem)
    expect(outputFileSystem.writeFile).toBe(compiler.outputFileSystem.writeFile)
  })
})
