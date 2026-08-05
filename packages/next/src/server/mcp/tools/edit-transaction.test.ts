import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type { Project } from '../../../build/swc/types'
import { registerEditTransactionTools } from './edit-transaction'

type ToolResult = {
  isError?: boolean
  content: Array<{ type: 'text'; text: string }>
}
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>

const temporaryRoots: string[] = []

function setup({
  app = true,
  pages = true,
  pageExtensions = ['js', 'jsx', 'ts', 'tsx'],
}: {
  app?: boolean
  pages?: boolean
  pageExtensions?: string[]
} = {}) {
  const turbopackRoot = mkdtempSync(join(tmpdir(), 'next-edit-transaction-'))
  temporaryRoots.push(turbopackRoot)
  const projectPath = join(turbopackRoot, 'project')
  mkdirSync(projectPath)
  const appDir = app ? join(projectPath, 'app') : undefined
  const pagesDir = pages ? join(projectPath, 'pages') : undefined
  if (appDir) mkdirSync(appDir)
  if (pagesDir) mkdirSync(pagesDir)
  const handlers = new Map<string, ToolHandler>()
  const server = {
    registerTool(name: string, _definition: unknown, handler: ToolHandler) {
      handlers.set(name, handler)
    },
  } as unknown as McpServer
  let nextNativeToken = 1
  let currentProject = {
    beginEditTransaction: jest.fn(async () => nextNativeToken++),
    renewEditTransaction: jest.fn(async () => true),
    endEditTransaction: jest.fn(async () => true),
  } as unknown as Project

  registerEditTransactionTools(
    server,
    projectPath,
    turbopackRoot,
    {
      appDir,
      pagesDir,
      pageExtensions,
      tsconfigPath: 'tsconfig.app.json',
    },
    () => currentProject
  )

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await handlers.get(name)!(args)
    return {
      isError: result.isError === true,
      value: JSON.parse(result.content[0].text),
    }
  }

  return {
    call,
    projectPath,
    turbopackRoot,
    get project() {
      return currentProject
    },
    setProject(project: Project) {
      currentProject = project
    },
  }
}

describe('MCP edit transaction tools', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('declares paths at begin and acknowledges the final flush', async () => {
    jest.useFakeTimers()
    const { call, project } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['components/card.tsx', 'components/card.tsx'],
    })

    expect(started.value).toMatchObject({
      status: 'started',
      leaseMs: 4_000,
      maximumDurationMs: 60_000,
    })
    expect(project.beginEditTransaction).toHaveBeenCalledWith([
      join('project', 'components', 'card.tsx'),
    ])

    const ended = await call('end_edit_transaction', {
      token: started.value.token,
    })
    expect(ended.value.status).toBe('flushed')
    expect(project.endEditTransaction).toHaveBeenCalledWith(1)
  })

  it('reports native contention without creating a public token', async () => {
    const { call, project } = setup()
    ;(project.beginEditTransaction as jest.Mock).mockResolvedValueOnce(null)

    const result = await call('begin_edit_transaction', {
      changedPaths: ['components/card.tsx'],
    })
    expect(result.value).toEqual({ status: 'busy', retryAfterMs: 25 })
  })

  it('renews the native lease and forgets rejected native tokens', async () => {
    const { call, project } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['components/card.tsx'],
    })
    expect(
      (
        await call('renew_edit_transaction', {
          token: started.value.token,
        })
      ).value.status
    ).toBe('renewed')
    ;(project.renewEditTransaction as jest.Mock).mockResolvedValueOnce(false)
    expect(
      (
        await call('renew_edit_transaction', {
          token: started.value.token,
        })
      ).value.status
    ).toBe('expired')
    expect(
      (
        await call('end_edit_transaction', {
          token: started.value.token,
        })
      ).value.status
    ).toBe('unknown')
  })

  it('bounds abandoned JavaScript state while native owns crash recovery', async () => {
    jest.useFakeTimers()
    const { call, project } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['components/card.tsx'],
    })

    jest.advanceTimersByTime(5_000)
    expect(
      (
        await call('end_edit_transaction', {
          token: started.value.token,
        })
      ).value.status
    ).toBe('unknown')
    expect(project.endEditTransaction).not.toHaveBeenCalled()
  })

  it('clamps renewal to the absolute native transaction deadline', async () => {
    jest.useFakeTimers()
    const { call } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['components/card.tsx'],
    })

    for (let renewal = 0; renewal < 14; renewal++) {
      jest.advanceTimersByTime(4_000)
      expect(
        (
          await call('renew_edit_transaction', {
            token: started.value.token,
          })
        ).value.status
      ).toBe('renewed')
    }
    jest.advanceTimersByTime(3_000)
    const finalRenewal = await call('renew_edit_transaction', {
      token: started.value.token,
    })
    expect(finalRenewal.value).toMatchObject({ status: 'renewed' })
    expect(finalRenewal.value.leaseMs).toBeGreaterThan(0)
    expect(finalRenewal.value.leaseMs).toBeLessThanOrEqual(1_000)

    jest.advanceTimersByTime(1_000)
    expect(
      (
        await call('end_edit_transaction', {
          token: started.value.token,
        })
      ).value.status
    ).toBe('unknown')
  })

  it('serializes an in-flight renewal before ending the transaction', async () => {
    const { call, project } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['components/card.tsx'],
    })
    let finishRenewal!: (renewed: boolean) => void
    ;(project.renewEditTransaction as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishRenewal = resolve
        })
    )

    const renewal = call('renew_edit_transaction', {
      token: started.value.token,
    })
    await Promise.resolve()
    const ending = call('end_edit_transaction', {
      token: started.value.token,
    })
    expect(project.endEditTransaction).not.toHaveBeenCalled()

    finishRenewal(true)
    expect((await renewal).value.status).toBe('renewed')
    expect((await ending).value.status).toBe('flushed')
    expect(
      (
        await call('end_edit_transaction', {
          token: started.value.token,
        })
      ).value.status
    ).toBe('unknown')
  })

  it('preserves the acknowledgement timeout when native cleanup fails', async () => {
    jest.useFakeTimers()
    const { call, project } = setup()
    ;(project.beginEditTransaction as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          setTimeout(() => resolve(1), 4_000)
        })
    )
    ;(project.endEditTransaction as jest.Mock).mockRejectedValueOnce(
      new Error('watcher stopped')
    )

    const beginning = call('begin_edit_transaction', {
      changedPaths: ['components/card.tsx'],
    })
    await jest.advanceTimersByTimeAsync(4_000)
    const result = await beginning
    expect(result.isError).toBe(true)
    expect(result.value.error).toContain(
      'Edit transaction acknowledgement timed out; retry'
    )
  })

  it('retains the project instance that acknowledged the token', async () => {
    const harness = setup()
    const originalProject = harness.project
    const started = await harness.call('begin_edit_transaction', {
      changedPaths: ['components/card.tsx'],
    })
    const replacementProject = {
      beginEditTransaction: jest.fn(),
      renewEditTransaction: jest.fn(),
      endEditTransaction: jest.fn(),
    } as unknown as Project
    harness.setProject(replacementProject)

    await harness.call('end_edit_transaction', { token: started.value.token })
    expect(originalProject.endEditTransaction).toHaveBeenCalledWith(1)
    expect(replacementProject.endEditTransaction).not.toHaveBeenCalled()
  })

  it('keeps a token retryable when native end fails', async () => {
    const { call, project } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['generated.ts'],
    })
    ;(project.endEditTransaction as jest.Mock)
      .mockRejectedValueOnce(new Error('flush failed'))
      .mockResolvedValueOnce(true)

    const failed = await call('end_edit_transaction', {
      token: started.value.token,
    })
    expect(failed.isError).toBe(true)
    expect(failed.value.error).toBe('flush failed')

    const retried = await call('end_edit_transaction', {
      token: started.value.token,
    })
    expect(retried.value.status).toBe('flushed')
    expect(project.endEditTransaction).toHaveBeenCalledTimes(2)
  })

  it('rejects paths handled by independent dev-server watchers', async () => {
    const { call, project } = setup()
    for (const changedPath of [
      '.env.local',
      'tsconfig.json',
      'tsconfig.app.json',
      'jsconfig.json',
      'next.config.ts',
      'app/page.tsx',
      'app/api/route.ts',
      'app/layout.tsx',
      'app/icon.tsx',
      'pages/index.tsx',
      'middleware.ts',
      'src/instrumentation.ts',
    ]) {
      const result = await call('begin_edit_transaction', {
        changedPaths: [changedPath],
      })
      expect(result.isError).toBe(true)
      expect(result.value.error).toContain(
        'watched outside the Turbopack source transaction'
      )
    }
    expect(project.beginEditTransaction).not.toHaveBeenCalled()
  })

  it('matches missing reserved files with filesystem case semantics', async () => {
    const { call, turbopackRoot, project } = setup()
    const caseInsensitive = existsSync(join(turbopackRoot, 'Project'))

    for (const changedPath of [
      '.ENV.LOCAL',
      'TSCONFIG.APP.JSON',
      'NEXT.CONFIG.TS',
      'SRC/INSTRUMENTATION.TS',
    ]) {
      const result = await call('begin_edit_transaction', {
        changedPaths: [changedPath],
      })
      expect(result.isError).toBe(caseInsensitive)
      if (caseInsensitive) {
        expect(result.value.error).toContain(
          'watched outside the Turbopack source transaction'
        )
      } else {
        expect(result.value.status).toBe('started')
        expect(
          (
            await call('end_edit_transaction', {
              token: result.value.token,
            })
          ).value.status
        ).toBe('flushed')
      }
    }
    expect(project.beginEditTransaction).toHaveBeenCalledTimes(
      caseInsensitive ? 0 : 4
    )

    const missingRoutes = setup({ app: false, pages: false })
    for (const changedPath of ['APP/PAGE.TSX', 'PAGES/INDEX.TSX']) {
      const result = await missingRoutes.call('begin_edit_transaction', {
        changedPaths: [changedPath],
      })
      expect(result.isError).toBe(caseInsensitive)
      if (caseInsensitive) {
        expect(result.value.error).toContain(
          'watched outside the Turbopack source transaction'
        )
      } else {
        expect(result.value.status).toBe('started')
        expect(
          (
            await missingRoutes.call('end_edit_transaction', {
              token: result.value.token,
            })
          ).value.status
        ).toBe('flushed')
      }
    }
  })

  it('rejects the nested instrumentation hook watched in src layouts', async () => {
    const { call, project } = setup()
    const result = await call('begin_edit_transaction', {
      changedPaths: ['src/src/instrumentation.ts'],
    })

    expect(result.isError).toBe(true)
    expect(result.value.error).toContain(
      'watched outside the Turbopack source transaction'
    )
    expect(project.beginEditTransaction).not.toHaveBeenCalled()
  })

  it('rejects route files under router directories that do not exist yet', async () => {
    const appOnly = setup({ pages: false })
    for (const changedPath of ['pages/new.tsx', 'src/pages/new.tsx']) {
      const result = await appOnly.call('begin_edit_transaction', {
        changedPaths: [changedPath],
      })
      expect(result.isError).toBe(true)
      expect(result.value.error).toContain(
        'watched outside the Turbopack source transaction'
      )
    }

    const pagesOnly = setup({ app: false })
    for (const changedPath of ['app/new/page.tsx', 'src/app/new/layout.tsx']) {
      const result = await pagesOnly.call('begin_edit_transaction', {
        changedPaths: [changedPath],
      })
      expect(result.isError).toBe(true)
      expect(result.value.error).toContain(
        'watched outside the Turbopack source transaction'
      )
    }
  })

  it('matches case-folded routes with custom uppercase extensions', async () => {
    const { call, project } = setup({
      app: false,
      pages: false,
      pageExtensions: ['TSX'],
    })

    for (const changedPath of ['pages/new.TSX', 'app/new/page.TSX']) {
      const result = await call('begin_edit_transaction', {
        changedPaths: [changedPath],
      })
      expect(result.isError).toBe(true)
      expect(result.value.error).toContain(
        'watched outside the Turbopack source transaction'
      )
    }
    expect(project.beginEditTransaction).not.toHaveBeenCalled()
  })

  it('rejects first-TypeScript activation with case-insensitive paths', async () => {
    const { call, projectPath, turbopackRoot, project } = setup()
    const nativeRealpath = realpathSync.native
    const canonicalProjectPath = nativeRealpath(projectPath)
    jest.spyOn(realpathSync, 'native').mockImplementation((candidate) => {
      if (candidate === join(turbopackRoot, 'Project')) {
        return canonicalProjectPath
      }
      return nativeRealpath(candidate)
    })

    for (const changedPath of [
      'app/components/new.tsx',
      'app/components/new.TSX',
    ]) {
      const rejected = await call('begin_edit_transaction', {
        changedPaths: [changedPath],
      })
      expect(rejected.isError).toBe(true)
      expect(rejected.value.error).toContain(
        'activate TypeScript through an independent dev-server watcher'
      )
    }
    expect(project.beginEditTransaction).not.toHaveBeenCalled()

    writeFileSync(join(projectPath, 'tsconfig.app.json'), '{}')
    const started = await call('begin_edit_transaction', {
      changedPaths: ['app/components/new.TSX'],
    })
    expect(started.value.status).toBe('started')
    expect(project.beginEditTransaction).toHaveBeenCalledTimes(1)
    expect(
      (
        await call('end_edit_transaction', {
          token: started.value.token,
        })
      ).value.status
    ).toBe('flushed')
  })

  it('rejects an existing directory before beginning', async () => {
    const { call, projectPath, project } = setup()
    mkdirSync(join(projectPath, 'components'))

    const result = await call('begin_edit_transaction', {
      changedPaths: ['components'],
    })
    expect(result.isError).toBe(true)
    expect(result.value.error).toContain(
      'must identify a file, not a directory'
    )
    expect(project.beginEditTransaction).not.toHaveBeenCalled()
  })

  it('rejects paths that traverse a symbolic link', async () => {
    const { call, projectPath, turbopackRoot, project } = setup()
    const outsideProject = join(turbopackRoot, 'outside-project')
    mkdirSync(outsideProject)
    symlinkSync(
      outsideProject,
      join(projectPath, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )

    const result = await call('begin_edit_transaction', {
      changedPaths: ['linked/card.tsx'],
    })
    expect(result.isError).toBe(true)
    expect(result.value.error).toContain('traverses a symbolic link')

    const parentSegmentResult = await call('begin_edit_transaction', {
      changedPaths: ['linked/../victim.ts'],
    })
    expect(parentSegmentResult.isError).toBe(true)
    expect(parentSegmentResult.value.error).toContain(
      'must not contain parent-directory segments'
    )
    expect(project.beginEditTransaction).not.toHaveBeenCalled()
  })

  it('rejects absolute paths and paths outside either root', async () => {
    const { call, project } = setup()
    for (const changedPath of ['/tmp/file.ts', '../file.ts', '.']) {
      expect(
        (
          await call('begin_edit_transaction', {
            changedPaths: [changedPath],
          })
        ).isError
      ).toBe(true)
    }
    expect(project.beginEditTransaction).not.toHaveBeenCalled()
  })
})
