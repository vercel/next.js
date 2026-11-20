import { mkdtemp, mkdir, readdir, readFile, rm, utimes } from 'fs/promises'
import { promises as fsPromises } from 'fs'
import os from 'os'
import path from 'path'

import { generateSharedTypes } from './shared-types'

// Generation without a lock, as when locking is unsupported.
jest.mock('../../build/lockfile', () => ({
  Lockfile: { acquireWithWait: jest.fn().mockResolvedValue(undefined) },
}))
jest.mock('../../build/route-discovery', () => ({
  discoverRoutes: jest.fn().mockResolvedValue({}),
}))
jest.mock('../../server/lib/router-utils/route-types-utils', () => ({
  createRouteTypesManifest: jest.fn().mockResolvedValue({}),
}))
jest.mock('../../server/lib/router-utils/typegen', () => ({
  generateRouteTypesFile: () => 'export type Routes = "/"\n',
  generateValidatorFile: () => 'export {}\n',
}))
jest.mock('../../server/lib/router-utils/root-params-type-utils', () => ({
  generateRootParamsFileContent: () => 'export {}\n',
}))

const ROUTES = 'export type Routes = "/"\n'

describe('generateSharedTypes temporary files', () => {
  let dir: string
  let typesDir: string
  let tempDir: string

  const generate = () =>
    generateSharedTypes({
      dir,
      config: {
        distDirRoot: '.next',
        experimental: {},
        pageExtensions: ['tsx'],
        cacheLife: {},
      } as any,
      appDir: undefined,
      pagesDir: undefined,
    })

  const isRoutesTempFile = (file: unknown) =>
    path.basename(String(file)).startsWith('routes.d.ts.') &&
    path.dirname(String(file)) === tempDir

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'shared-types-'))
    typesDir = path.join(dir, '.next', 'types')
    tempDir = path.join(typesDir, '.tmp')
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  it('removes the temporary file when a write fails', async () => {
    // A directory in place of the type file makes the rename fail.
    await mkdir(path.join(typesDir, 'routes.d.ts', 'blocker'), {
      recursive: true,
    })

    await expect(generate()).rejects.toThrow()

    expect(await readdir(tempDir)).toEqual([])
  })

  it('retries when its temporary file was removed as stale', async () => {
    const writeFile = fsPromises.writeFile
    let removals = 0
    jest
      .spyOn(fsPromises, 'writeFile')
      .mockImplementation(async (file, ...args: any[]) => {
        await (writeFile as any)(file, ...args)
        // Another process sweeps the temporary file of this stalled write.
        if (isRoutesTempFile(file) && removals++ === 0) {
          await rm(file as string)
        }
      })

    await generate()

    expect(removals).toBe(2)
    expect(await readFile(path.join(typesDir, 'routes.d.ts'), 'utf8')).toBe(
      ROUTES
    )
    expect(await readdir(tempDir)).toEqual([])
  })

  it('fails after repeatedly losing its temporary file', async () => {
    const writeFile = fsPromises.writeFile
    let removals = 0
    jest
      .spyOn(fsPromises, 'writeFile')
      .mockImplementation(async (file, ...args: any[]) => {
        await (writeFile as any)(file, ...args)
        if (isRoutesTempFile(file)) {
          removals++
          await rm(file as string)
        }
      })

    await expect(generate()).rejects.toMatchObject({ code: 'ENOENT' })

    expect(removals).toBe(3)
    expect(await readdir(tempDir)).toEqual([])
  })

  it('removes only temporary files older than the stale age', async () => {
    await mkdir(tempDir, { recursive: true })
    const orphaned = path.join(tempDir, 'routes.d.ts.1.00000000.tmp')
    const pending = path.join(tempDir, 'routes.d.ts.2.11111111.tmp')
    await fsPromises.writeFile(orphaned, '')
    await fsPromises.writeFile(pending, '')
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
    await utimes(orphaned, twoMinutesAgo, twoMinutesAgo)

    await generate()

    expect(await readdir(tempDir)).toEqual([path.basename(pending)])
  })
})
