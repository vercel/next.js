import { createRequire } from 'node:module'
import { inflateRawSync } from 'node:zlib'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import {
  validateFederationTypesArchive,
  writeModuleFederationTypes,
} from 'next/dist/lib/module-federation-types'

const describeTurbopack =
  process.env.IS_TURBOPACK_TEST && !process.env.__NEXT_CACHE_COMPONENTS
    ? describe
    : describe.skip

// ZIP local headers can omit compressed lengths; read them from the central directory.
function readZipEntry(zip: Buffer, filename: string): string {
  const entries: string[] = []
  for (let offset = 0; offset + 46 <= zip.length; offset++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) continue
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength)
    entries.push(name)
    if (name.startsWith('compiled-types/') && name.endsWith(`/${filename}`)) {
      const local = zip.readUInt32LE(offset + 42)
      const start =
        local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const compressed = zip.subarray(
        start,
        start + zip.readUInt32LE(offset + 20)
      )
      const method = zip.readUInt16LE(offset + 10)
      if (method === 0) return compressed.toString('utf8')
      if (method === 8) return inflateRawSync(compressed).toString('utf8')
      throw new Error(`Unsupported ZIP compression method ${method}`)
    }
    offset += 45 + nameLength + extraLength + commentLength
  }
  throw new Error(
    `Missing ZIP declaration ${filename}; found ${entries.join(', ')}`
  )
}

describeTurbopack('producer Module Federation declarations', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@module-federation/runtime-tools': '2.9.0',
      '@module-federation/dts-plugin': '2.9.0',
    },
  })

  async function getTypes() {
    // The production Turbopack test server enforces a deployment ID on mutable
    // static URLs; real deployments and the development server do not use this test ID.
    const suffix = !isNextDev && !isNextDeploy ? '?dpl=test-dpl-id-1234' : ''
    const manifestResponse = await next.fetch(
      `/_next/static/mf-manifest.json${suffix}`
    )
    expect(manifestResponse.status).toBe(200)
    const manifest = (await manifestResponse.json()) as {
      metaData: {
        types?: { path: string; name: string; zip: string; api: string }
      }
    }
    expect(manifest.metaData.types).toEqual({
      path: '',
      name: '@mf-types',
      zip: '@mf-types.zip',
      api: '@mf-types.d.ts',
    })
    const zipResponse = await next.fetch(`/_next/static/@mf-types.zip${suffix}`)
    const apiResponse = await next.fetch(
      `/_next/static/@mf-types.d.ts${suffix}`
    )
    expect(zipResponse.status).toBe(200)
    expect(apiResponse.status).toBe(200)
    const zip = Buffer.from(await zipResponse.arrayBuffer())
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    return {
      archive: zip,
      widget: readZipEntry(zip, 'Widget.d.ts'),
      answer: readZipEntry(zip, 'answer.d.ts'),
      api: await apiResponse.text(),
    }
  }

  it('publishes real TS and TSX exports and the standard manifest metadata', async () => {
    const types = await getTypes()
    expect(types.widget).toContain('interface WidgetProps')
    expect(types.widget).toContain('widgetVersion')
    expect(types.widget).toContain('export default Widget')
    expect(types.widget).toContain('initial-label')
    expect(types.answer).toContain('answer')
    expect(types.api).toContain('RemoteKeys')
    expect([types.widget, types.answer, types.api].join('\n')).not.toContain(
      next.testDir
    )
  })

  it('rejects ZIP members with path traversal or Windows drive names', async () => {
    const { archive } = await getTypes()
    validateFederationTypesArchive(archive)
    expect(() =>
      validateFederationTypesArchive(Buffer.from('not a zip'))
    ).toThrow('invalid ZIP archive')
    const marker = archive.lastIndexOf(Buffer.from('compiled-types/'))
    expect(marker).toBeGreaterThan(0)
    const traversal = Buffer.from(archive)
    Buffer.from('../').copy(traversal, marker)
    expect(() => validateFederationTypesArchive(traversal)).toThrow(
      'unsafe entry'
    )
    const drivePath = Buffer.from(archive)
    Buffer.from('C:').copy(drivePath, marker)
    expect(() => validateFederationTypesArchive(drivePath)).toThrow(
      'unsafe entry'
    )
  })

  if (!isNextDeploy) {
    it('reports missing and incompatible optional producer peers', async () => {
      const projectDir = await mkdtemp(join(tmpdir(), 'next-mf-no-peer-'))
      const incompatibleDir = await mkdtemp(join(tmpdir(), 'next-mf-old-peer-'))
      const options = (dir: string) => ({
        projectDir: dir,
        distDir: join(dir, '.next'),
        federation: {
          name: 'testProducer',
          exposes: { './answer': './answer.ts' },
          dts: { generateTypes: true as const },
        },
      })
      try {
        for (const dir of [projectDir, incompatibleDir]) {
          await mkdir(join(dir, '.next/static'), { recursive: true })
          await writeFile(join(dir, 'package.json'), '{}')
          await writeFile(join(dir, 'tsconfig.json'), '{"compilerOptions":{}}')
          await writeFile(
            join(dir, '.next/static/mf-manifest.json'),
            '{"metaData":{}}'
          )
        }
        // An ancestor of tmpdir() may already provide this optional peer on CI.
        const fromProject = createRequire(join(projectDir, 'package.json'))
        let hasAncestorPeer = false
        try {
          fromProject.resolve('@module-federation/dts-plugin/package.json')
          hasAncestorPeer = true
        } catch {}
        if (hasAncestorPeer) {
          // In CI, a valid ancestor installation is expected to resolve here.
          expect(
            (
              fromProject('@module-federation/dts-plugin/package.json') as {
                version: string
              }
            ).version
          ).toMatch(/^2\.9\./)
        } else {
          await expect(
            writeModuleFederationTypes(options(projectDir))
          ).rejects.toThrow('Install it in the producing app')
        }
        const peerDir = join(
          incompatibleDir,
          'node_modules/@module-federation/dts-plugin'
        )
        await mkdir(peerDir, { recursive: true })
        await writeFile(
          join(peerDir, 'package.json'),
          '{"name":"@module-federation/dts-plugin","version":"1.0.0"}'
        )
        await expect(
          writeModuleFederationTypes(options(incompatibleDir))
        ).rejects.toThrow('found 1.0.0')
      } finally {
        await Promise.all([
          rm(projectDir, { recursive: true, force: true }),
          rm(incompatibleDir, { recursive: true, force: true }),
        ])
      }
    })

    // A nested project has no node_modules. Its optional DTS peer lives in the
    // ancestor app, just as it does in a hoisted monorepo installation.
    it('resolves a hoisted producer DTS peer from ancestor node_modules', async () => {
      const projectDir = join(next.testDir, 'hoisted-producer')
      const distDir = join(projectDir, '.next')
      await mkdir(join(distDir, 'static'), { recursive: true })
      try {
        await writeFile(
          join(projectDir, 'package.json'),
          '{"name":"hoisted-producer"}'
        )
        await writeFile(
          join(projectDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'Bundler',
              declaration: true,
            },
            include: ['answer.ts'],
          })
        )
        await writeFile(
          join(projectDir, 'answer.ts'),
          'export const nestedAnswer: 42 = 42\n'
        )
        await writeFile(
          join(distDir, 'static', 'mf-manifest.json'),
          '{"metaData":{}}'
        )
        await writeModuleFederationTypes({
          projectDir,
          distDir,
          federation: {
            name: 'hoistedProducer',
            exposes: { './answer': './answer.ts' },
            dts: { generateTypes: true },
          },
        })
        const archive = await readFile(join(distDir, 'static', '@mf-types.zip'))
        expect(readZipEntry(archive, 'answer.d.ts')).toContain('nestedAnswer')
      } finally {
        await rm(projectDir, { recursive: true, force: true })
      }
    })
  }

  if (isNextDev) {
    it('refreshes declarations on a type-only change without a JS change', async () => {
      const widgetPath = join(next.testDir, 'lib/Widget.tsx')
      const original = await readFile(widgetPath, 'utf8')
      try {
        await writeFile(
          widgetPath,
          original.replace('initial-label', 'updated-type-only')
        )
        await retry(async () => {
          const types = await getTypes()
          expect(types.widget).toContain('updated-type-only')
          expect(types.widget).not.toContain('initial-label')
        }, 30_000)
      } finally {
        await writeFile(widgetPath, original)
      }
    })

    it('removes stale declarations and reports a dev error when an exposed type breaks', async () => {
      const widgetPath = join(next.testDir, 'lib/Widget.tsx')
      const original = await readFile(widgetPath, 'utf8')
      try {
        await writeFile(
          widgetPath,
          `${original}\nexport const broken: string = 123\n`
        )
        await retry(async () => {
          const manifest = (await (
            await next.fetch('/_next/static/mf-manifest.json')
          ).json()) as { metaData: { types?: unknown } }
          expect(manifest.metaData.types).toBeUndefined()
          expect((await next.fetch('/_next/static/@mf-types.zip')).status).toBe(
            404
          )
          expect(
            (await next.fetch('/_next/static/@mf-types.d.ts')).status
          ).toBe(404)
        }, 30_000)
        await retry(() => {
          expect(next.cliOutput).toMatch(
            /TYPE-001|Failed to generate type declaration/
          )
        }, 30_000)
      } finally {
        await writeFile(widgetPath, original)
      }
      await retry(async () => {
        expect((await getTypes()).widget).toContain('initial-label')
      }, 30_000)
    })
  }
})

// This fixture deliberately contains invalid TS. The build-failure assertion cannot run
// after deployment, but the lenient generation fixture below still verifies deploy output.
const describeLocalTurbopack =
  process.env.IS_TURBOPACK_TEST &&
  !process.env.__NEXT_CACHE_COMPONENTS &&
  !isNextDeploy
    ? describe
    : describe.skip

describeLocalTurbopack('strict producer type errors', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      '@module-federation/runtime-tools': '2.9.0',
      '@module-federation/dts-plugin': '2.9.0',
    },
  })

  it('fails production or surfaces a dev issue for invalid exposed TypeScript', async () => {
    await next.patchFile('lib/Widget.tsx', (source) =>
      source?.includes('export const broken: string = 123')
        ? source
        : `${source}\nexport const broken: string = 123\n`
    )
    if (isNextDev) {
      await next.start()
      await retry(() => {
        expect(next.cliOutput).toContain(
          'Module Federation type generation failed'
        )
      }, 30_000)
    } else {
      await expect(next.start()).rejects.toThrow()
      expect(next.cliOutput).toMatch(
        /TYPE-001|Failed to generate type declaration/
      )
    }
  })
})

describeTurbopack('lenient producer type errors', () => {
  const { next, isNextDev } = nextTestSetup({
    // The invalid expose is fixed in the fixture so deployed tests do not need patchFile.
    files: join(__dirname, 'lenient'),
    dependencies: {
      '@module-federation/runtime-tools': '2.9.0',
      '@module-federation/dts-plugin': '2.9.0',
    },
  })

  it('reports diagnostics but publishes neither stale types nor manifest metadata', async () => {
    const suffix = !isNextDev && !isNextDeploy ? '?dpl=test-dpl-id-1234' : ''
    const manifest = (await (
      await next.fetch(`/_next/static/mf-manifest.json${suffix}`)
    ).json()) as { metaData: { types?: unknown } }
    expect(manifest.metaData.types).toBeUndefined()
    expect(
      (await next.fetch(`/_next/static/@mf-types.zip${suffix}`)).status
    ).toBe(404)
    expect(
      (await next.fetch(`/_next/static/@mf-types.d.ts${suffix}`)).status
    ).toBe(404)
    if (!isNextDeploy) {
      expect(next.cliOutput).toContain('omitting types')
    }
  })
})
