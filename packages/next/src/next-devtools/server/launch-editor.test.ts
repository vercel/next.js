// packages/next/src/next-devtools/server/launch-editor.test.ts

// --- mocks (SUT imports 'child_process', but we also cover 'node:child_process') ---
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    unref: jest.fn(),
  })),
  execFile: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    unref: jest.fn(),
  })),
}))
jest.mock('node:child_process', () => ({
  spawn: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    unref: jest.fn(),
  })),
  execFile: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    unref: jest.fn(),
  })),
}))

import * as Launch from '../server/launch-editor'
import fs from 'fs'
import { escapeApplescriptStringFragment } from '../server/launch-editor'

// IMPORTANT: assert against the same module the SUT imports
const { spawn, execFile } = jest.requireMock('child_process') as {
  spawn: jest.Mock
  execFile: jest.Mock
}

function forceWin32() {
  Object.defineProperty(process, 'platform', { value: 'win32' })
}

describe('Launch Editor RCE hardening (Windows)', () => {
  let existsSpy: jest.SpyInstance

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  beforeEach(() => {
    jest.resetAllMocks()
    forceWin32()
    // Short-circuit guessEditor()
    process.env.REACT_EDITOR = 'Code.exe'
    // Pretend file exists so we go into launch flow
    existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true)
  })

  afterEach(() => {
    delete process.env.REACT_EDITOR
    existsSpy.mockRestore()
  })

  test('blocks disallowed cmd.exe metacharacters BEFORE spawning any process', async () => {
    const bad = [
      'app\\bad&file\\page.tsx',
      'app\\bad|file\\page.tsx',
      'app\\bad^file\\page.tsx',
      'app\\bad>file\\page.tsx',
      'app\\bad<file\\page.tsx',
    ]
    for (const name of bad) {
      await (Launch as any).__test_openInEditorForWin(name)
    }
    expect(spawn).not.toHaveBeenCalled()
    expect(execFile).not.toHaveBeenCalled()
  })

  test('allows parentheses and spawns via cmd.exe with the path intact', async () => {
    const ok = 'app\\(group)\\broken\\page.tsx'

    await (Launch as any).__test_openInEditorForWin(ok)

    // Current Windows code path uses: cmd.exe /C <editor> <args...>
    expect(spawn).toHaveBeenCalled()
    const [bin, args, opts] = spawn.mock.calls[0]

    expect((bin as string).toLowerCase()).toContain('cmd')
    expect(args[0]).toBe('/C')
    expect((args as string[]).join(' ')).toContain('(group)\\broken\\page.tsx')
    expect(opts?.shell).toBeFalsy()
  })

  test('still blocks RCE when parentheses are present (mixed payloads)', async () => {
    const mixed = [
      'app\\(group)&whoami\\page.tsx',
      'app\\(group)|type\\page.tsx',
      'app\\(group)^more\\page.tsx',
      'app\\(group)>nul\\page.tsx',
      'app\\<nul(group)\\page.tsx',
      'app\\group&(x)\\page.tsx',
      'app\\group|(x)\\page.tsx',
      'app\\group^(x)\\page.tsx',
      'app\\group>(x)\\page.tsx',
      'app\\group<(x)\\page.tsx',
      '  app\\(group)&echo\\page.tsx  ',
      '\tapp\\(x)|dir\\page.tsx',
    ]

    for (const name of mixed) {
      await (Launch as any).__test_openInEditorForWin(name)
    }

    expect(spawn).not.toHaveBeenCalled()
    expect(execFile).not.toHaveBeenCalled()
  })

  // keep skipped until you introduce a 'start' style fallback that needs ^ escaping
  // test.skip('cmd.exe fallback (if present) caret-escapes parentheses to avoid grouping', async () => {})
})

describe('applescript string escaping', () => {
  it('should escape strings correctly', () => {
    const result = escapeApplescriptStringFragment(`abc\\def"ghi\\\\`)
    expect(result).toBe(`abc\\\\def\\"ghi\\\\\\\\`)
  })
})
