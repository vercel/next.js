/* eslint-env jest */
/**
 * Tests for the NAPI-based WASM plugin runtime.
 *
 * Level 1: wasm-manager worker pool lifecycle (compile, instantiate, drop)
 * Level 2: Full transform through the SWC bindings with a real plugin binary
 */
import path from 'path'

// ---------------------------------------------------------------------------
// Level 1: wasm-manager worker pool and module lifecycle
// ---------------------------------------------------------------------------

describe('wasm-manager', () => {
  let wasmManager: typeof import('next/dist/build/swc/wasm-manager').wasmManager

  beforeAll(() => {
    // Import wasm-manager directly to test its API without loading native bindings
    wasmManager = require('next/dist/build/swc/wasm-manager').wasmManager
  })

  afterAll(() => {
    // Workers are daemon threads; they'll be cleaned up on process exit.
    // No explicit shutdown API yet.
  })

  it('initWorkerPool creates workers', () => {
    // Set a dummy bindings path for testing (workers won't actually load it
    // in these lifecycle tests since we don't instantiate WASM modules)
    wasmManager.setBindingsPath(
      path.join(
        __dirname,
        '..',
        '..',
        'node_modules',
        '@next',
        'swc',
        'native',
        'next-swc.darwin-arm64.node'
      )
    )
    // initWorkerPool now returns void (no SABs)
    wasmManager.initWorkerPool(2)
  })

  it('compileModule returns a module ID', () => {
    // Minimal valid WASM module: magic + version + empty
    const minimalWasm = new Uint8Array([
      0x00,
      0x61,
      0x73,
      0x6d, // magic: \0asm
      0x01,
      0x00,
      0x00,
      0x00, // version: 1
    ])
    const moduleId = wasmManager.compileModule(Buffer.from(minimalWasm))
    expect(typeof moduleId).toBe('number')
    expect(moduleId).toBeGreaterThan(0)

    // Clean up
    wasmManager.dropModule(moduleId)
  })

  it('cloneModule returns a new ID for the same module', () => {
    const minimalWasm = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ])
    const moduleId = wasmManager.compileModule(Buffer.from(minimalWasm))
    const cloneId = wasmManager.cloneModule(moduleId)

    expect(cloneId).not.toBe(moduleId)
    expect(typeof cloneId).toBe('number')

    // Both should be droppable independently
    wasmManager.dropModule(moduleId)
    wasmManager.dropModule(cloneId)
  })

  it('cloneModule throws for unknown module', () => {
    expect(() => wasmManager.cloneModule(999999)).toThrow(/not found/)
  })

  // Note: instantiateOnWorker is not tested here because it requires
  // the native addon to be loaded in the worker thread (the worker enters
  // a blocking NAPI work loop after instantiation). Full instantiation
  // is tested in the Level 2 tests via the SWC transform path.
})

// ---------------------------------------------------------------------------
// Level 2: Full SWC transform with a real plugin
// ---------------------------------------------------------------------------

describe('swc plugin transform via NAPI runtime', () => {
  let transform: typeof import('next/dist/build/swc').transform
  let pluginPath: string

  beforeAll(async () => {
    // installBindings() sets loadedBindings so transform() (which uses
    // getBindingsSync()) works. The Rust side is idempotent — if the
    // jest-transformer already registered workers, this is a no-op.
    const { installBindings } = require('next/dist/build/swc/install-bindings')
    await installBindings()
    transform = require('next/dist/build/swc').transform
    pluginPath = require.resolve('@swc/plugin-react-remove-properties')
  })

  it('transforms code without plugins (sanity check)', async () => {
    const result = await transform('const x = 1', {
      filename: 'test.ts',
      jsc: { parser: { syntax: 'typescript', tsx: false } },
    })
    expect(result.code).toContain('x')
  }, 10000)

  it('transforms code with swc plugin (removes data-* attributes)', async () => {
    const source = `
      export default function Page() {
        return <div data-testid="hello" data-custom="remove-me">Hello World</div>
      }
    `

    let result: any
    try {
      result = await transform(source, {
        filename: 'test.tsx',
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: true,
          },
          experimental: {
            plugins: [[pluginPath, { properties: ['data-custom'] }]],
          },
        },
      })
    } catch (e: any) {
      console.error('Transform error:', e.message)
      console.error('Full error:', JSON.stringify(e, null, 2))
      throw e
    }

    expect(result.code).toContain('Hello World')
    // data-testid should remain (not in the removal list)
    expect(result.code).toContain('data-testid')
    // data-custom should be removed by the plugin
    expect(result.code).not.toContain('data-custom')
  })

  it('transforms code with plugin removing all data-testid', async () => {
    const source = `
      export default function Page() {
        return (
          <div data-testid="a">
            <span data-testid="b">text</span>
          </div>
        )
      }
    `

    const result = await transform(source, {
      filename: 'test.tsx',
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: true,
        },
        experimental: {
          plugins: [[pluginPath, { properties: ['^data-testid$'] }]],
        },
      },
    })

    expect(result.code).toContain('text')
    expect(result.code).not.toContain('data-testid')
  })

  it('handles multiple sequential transforms', async () => {
    for (let i = 0; i < 5; i++) {
      const source = `
        export function Comp${i}() {
          return <div data-remove="yes">item ${i}</div>
        }
      `
      const result = await transform(source, {
        filename: `test${i}.tsx`,
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          experimental: {
            plugins: [[pluginPath, { properties: ['data-remove'] }]],
          },
        },
      })

      expect(result.code).toContain(`item ${i}`)
      expect(result.code).not.toContain('data-remove')
    }
  })
})
