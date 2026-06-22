import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  prepareDeployableTarballs,
  validateDeployableTarballOptions,
} from '../../lib/next-modes/deployable-tarballs'

const TARBALL_FILENAMES = [
  'next.tar',
  'next-mdx.tar',
  'next-env.tar',
  'next-bundle-analyzer.tar',
  'next-swc.tar',
]

describe('deployable tarballs', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        fs.rm(directory, {
          recursive: true,
          force: true,
        })
      )
    )
  })

  async function createTemporaryDirectory(prefix: string): Promise<string> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
    temporaryDirectories.push(directory)
    return directory
  }

  it('copies tarballs and patches the exact project package.json', async () => {
    const sourceDir = await createTemporaryDirectory('next-tarballs-')
    const projectDir = await createTemporaryDirectory('next-project-')

    await Promise.all(
      TARBALL_FILENAMES.map((filename) =>
        fs.writeFile(path.join(sourceDir, filename), filename)
      )
    )
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          next: 'canary',
          '@next/mdx': 'canary',
          example: '1.0.0',
        },
        overrides: { example: '2.0.0' },
        resolutions: { other: '3.0.0' },
      })
    )

    await prepareDeployableTarballs(sourceDir, projectDir)

    for (const filename of TARBALL_FILENAMES) {
      await expect(
        fs.readFile(path.join(projectDir, 'tarballs', filename), 'utf8')
      ).resolves.toBe(filename)
    }

    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectDir, 'package.json'), 'utf8')
    )
    expect(packageJson.dependencies).toMatchObject({
      next: 'file:./tarballs/next.tar',
      '@next/mdx': 'file:./tarballs/next-mdx.tar',
      '@next/swc': 'file:./tarballs/next-swc.tar',
      example: '1.0.0',
    })
    expect(packageJson.overrides).toMatchObject({
      next: 'file:./tarballs/next.tar',
      '@next/env': 'file:./tarballs/next-env.tar',
      '@next/swc': 'file:./tarballs/next-swc.tar',
      example: '2.0.0',
    })
    expect(packageJson.resolutions).toMatchObject({
      next: 'file:./tarballs/next.tar',
      '@next/bundle-analyzer': 'file:./tarballs/next-bundle-analyzer.tar',
      other: '3.0.0',
    })
  })

  it('reports a missing tarball before patching the project', async () => {
    const sourceDir = await createTemporaryDirectory('next-tarballs-')
    const projectDir = await createTemporaryDirectory('next-project-')
    await fs.writeFile(path.join(projectDir, 'package.json'), '{}')

    await expect(
      prepareDeployableTarballs(sourceDir, projectDir)
    ).rejects.toThrow('Run `pnpm pack-next --tar` first')

    await expect(
      fs.readFile(path.join(projectDir, 'package.json'), 'utf8')
    ).resolves.toBe('{}')
  })

  it.each([
    ['NEXT_TEST_DEPLOY_URL', 'https://example.vercel.app', undefined],
    ['NEXT_TEST_VERSION', undefined, 'canary'],
  ])(
    'rejects local tarballs with %s',
    (variable, existingDeployUrl, nextTestVersion) => {
      expect(() =>
        validateDeployableTarballOptions({
          localTarballsDir: '/tmp/tarballs',
          existingDeployUrl,
          nextTestVersion,
        })
      ).toThrow(`NEXT_TEST_DEPLOY_TARBALLS_DIR cannot be used with ${variable}`)
    }
  )
})
