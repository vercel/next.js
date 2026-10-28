import path from 'path'
import type {} from '../../../turbopack/crates/turbopack-node/js/src/loader-runner'
import transform from '../../../turbopack/crates/turbopack-node/js/src/transforms/webpack-loaders'
import type { TransformIpc } from '../../../turbopack/crates/turbopack-node/js/src/transforms/transforms'

jest.mock(
  '@vercel/turbopack/loader-runner',
  () =>
    require('../../../packages/next/src/compiled/loader-runner/LoaderRunner'),
  { virtual: true }
)

describe('webpack loader emitFile IPC', () => {
  beforeAll(() => {
    Object.assign(globalThis, { __turbopack_external_require__: require })
  })

  afterAll(() => {
    Reflect.deleteProperty(globalThis, '__turbopack_external_require__')
  })

  const ipc: TransformIpc = {
    sendInfo: jest.fn().mockResolvedValue(undefined),
    sendRequest: jest
      .fn()
      .mockRejectedValue(new Error('Unexpected IPC request')),
    sendError: jest.fn().mockRejectedValue(new Error('Unexpected IPC error')),
  }

  function run(options: Record<string, unknown> = {}) {
    return transform(
      ipc,
      'source',
      'input.emit',
      '',
      [{ loader: path.join(__dirname, 'loader.js'), options }],
      'web',
      'development',
      true
    )
  }

  it('transports text, binary, and empty contents without changing loader output', async () => {
    const result = await run()
    expect(result.source).toBe('export default "source"')
    expect(result.assets).toEqual([
      { file: 'text.txt', content: 'source' },
      { file: 'binary.bin', content: { binary: 'AP+ACg==' } },
      { file: 'empty.txt', content: '' },
      { file: 'empty.bin', content: { binary: '' } },
    ])
  })

  it('preserves distinct asset names and overwrites only an identical name', async () => {
    const result = await run({ duplicate: true })
    expect(result.assets).toEqual([
      { file: 'nested\\asset.txt', content: 'first' },
      { file: 'nested/asset.txt', content: 'last' },
    ])
  })

  it('transports a source map object', async () => {
    const result = await run({ map: true })
    expect(result.assets[0]).toEqual({
      file: 'mapped.txt',
      content: 'source',
      sourceMap: { version: 3, sources: ['input.emit'], mappings: '' },
    })
  })

  it('preserves late Buffer mutations', async () => {
    const result = await run({ mutableBuffer: true })
    expect(result.assets[0]).toEqual({
      file: 'mutable.bin',
      content: { binary: '/w==' },
    })
  })

  it('transports only the minimized flag from assetInfo', async () => {
    const result = await run({ ignoredInfo: true })
    expect(result.assets).toEqual([
      { file: 'ignored-info.txt', content: 'source' },
      { file: 'minimized.js', content: 'source', minimized: true },
    ])
  })

  it('collects files from pitch functions', async () => {
    const result = await run({ pitch: true })
    expect(result.source).toBe('export default "pitched"')
    expect(result.assets).toEqual([{ file: 'pitch.txt', content: 'pitched' }])
  })

  it('does not retain assets between transformations', async () => {
    await run()
    expect((await run({ noEmit: true })).assets).toEqual([])
  })

  it('rejects non-string filenames with a loader diagnostic', async () => {
    await expect(run({ invalidName: true })).rejects.toThrow(
      'emitFile(name, content): name must be a string'
    )
  })
})
