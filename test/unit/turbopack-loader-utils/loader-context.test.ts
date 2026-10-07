import path from 'path'
import type { TransformIpc } from '../../../turbopack/crates/turbopack-node/js/src/transforms/transforms'

jest.mock(
  '@vercel/turbopack/loader-runner',
  () =>
    require('../../../packages/next/src/compiled/loader-runner/LoaderRunner.js'),
  { virtual: true }
)

// Only the Rust IPC boundary is mocked; the transform and loader-runner are real.
jest.mock(
  '../../../turbopack/crates/turbopack-node/js/src/transforms/transforms',
  () => ({
    getReadEnvVariables: () => [],
  })
)

import transform from '../../../turbopack/crates/turbopack-node/js/src/transforms/webpack-loaders'

describe('loader context utils', () => {
  it('runs real style-loader pitching using utils without compiler emulation', async () => {
    const original = (globalThis as any).__turbopack_external_require__
    ;(globalThis as any).__turbopack_external_require__ = require
    const ipc = {
      sendInfo: jest.fn(),
      sendRequest: jest.fn(),
      sendError: jest.fn(),
    } as unknown as TransformIpc
    try {
      const loader = require.resolve('style-loader', {
        paths: [path.join(__dirname, '../../../packages/next')],
      })
      const result = (await transform(
        ipc,
        '.foo { color: red }',
        'src/styles.css',
        '',
        [loader],
        'web',
        'development',
        false
      )) as { source: string }
      expect(result.source).toContain('injectStylesIntoStyleTag.js')
      expect(result.source).toContain('!!./styles.css')
      expect(ipc.sendRequest).not.toHaveBeenCalled()
      expect(ipc.sendError).not.toHaveBeenCalled()
    } finally {
      ;(globalThis as any).__turbopack_external_require__ = original
    }
  })

  it.each(['development', 'production'] as const)(
    'runs a loader without webpack/compiler emulation in %s',
    async (mode) => {
      const original = (globalThis as any).__turbopack_external_require__
      ;(globalThis as any).__turbopack_external_require__ = require
      const ipc = {
        sendInfo: jest.fn(),
        sendRequest: jest.fn(),
        sendError: jest.fn(),
      } as unknown as TransformIpc
      try {
        const result = (await transform(
          ipc,
          'input',
          'src/input.js',
          '',
          [path.join(__dirname, 'fixtures/utils-loader.js')],
          'web',
          mode,
          false
        )) as { source: string }
        expect(JSON.parse(result.source)).toEqual({
          relative: './src/input.js?q',
          absolute: path.join(process.cwd(), 'src/input.js'),
          hash: 'a448017aaf21d8525fc10ae87aa6729d',
          xxhash: '44bc2cf5ad770999',
          webpack: false,
          compiler: false,
        })
        expect(ipc.sendRequest).not.toHaveBeenCalled()
        expect(ipc.sendError).not.toHaveBeenCalled()
      } finally {
        ;(globalThis as any).__turbopack_external_require__ = original
      }
    }
  )
})
