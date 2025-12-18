/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  nextBuild,
  killApp,
  retry,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
// Dynamic types (image types, navigation compat) are now generated in .next/types/
// In dev mode with isolatedDevBuild (default), types are in .next/dev/types/
const dynamicTypesFileBuild = join(appDir, '.next/types/next-env.d.ts')
const dynamicTypesFileDev = join(appDir, '.next/dev/types/next-env.d.ts')
let appPort
let app
let output

const handleOutput = (msg) => {
  output += msg
}

// Helper to read dynamic types file with retry (file may be written async)
async function readDynamicTypesFile(isDev: boolean) {
  const filePath = isDev ? dynamicTypesFileDev : dynamicTypesFileBuild
  return retry(async () => {
    return await fs.readFile(filePath, 'utf8')
  })
}

describe('TypeScript Image Component', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should fail to build invalid usage of the Image component', async () => {
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        expect(stderr).toMatch(/Failed to compile/)
        expect(stderr).toMatch(/is not assignable to type/)
        expect(code).toBe(1)
        const envTypes = await readDynamicTypesFile(false)
        expect(envTypes).toContain('image-types/global')
      })

      it('should remove global image types when disabled', async () => {
        const content = await fs.readFile(nextConfig, 'utf8')
        await fs.writeFile(
          nextConfig,
          content.replace('// disableStaticImages', 'disableStaticImages')
        )
        const { code, stderr } = await nextBuild(appDir, [], { stderr: true })
        expect(stderr).toMatch(/Failed to compile/)
        expect(stderr).toMatch(/is not assignable to type/)
        expect(code).toBe(1)
        await fs.writeFile(nextConfig, content)
        const envTypes = await readDynamicTypesFile(false)
        expect(envTypes).not.toContain('image-types/global')
      })
    }
  )
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        output = ''
        appPort = await findPort()
        app = await launchApp(appDir, appPort, {
          onStdout: handleOutput,
          onStderr: handleOutput,
        })
      })
      afterAll(() => killApp(app))

      it('should have image types when enabled', async () => {
        const envTypes = await readDynamicTypesFile(true)
        expect(envTypes).toContain('image-types/global')
      })

      it('should render the valid Image usage and not print error', async () => {
        const html = await renderViaHTTP(appPort, '/valid', {})
        expect(html).toMatch(/This is valid usage of the Image component/)
        expect(output).not.toMatch(/Error: Image/)
      })

      it('should print error when invalid Image usage', async () => {
        await renderViaHTTP(appPort, '/invalid', {})
        expect(output).toMatch(/Error: Image/)
      })
    }
  )

  it('should remove global image types when disabled (dev)', async () => {
    const content = await fs.readFile(nextConfig, 'utf8')
    await fs.writeFile(
      nextConfig,
      content.replace('// disableStaticImages', 'disableStaticImages')
    )
    const app = await launchApp(appDir, await findPort())
    await killApp(app)
    await fs.writeFile(nextConfig, content)
    const envTypes = await readDynamicTypesFile(true)
    expect(envTypes).not.toContain('image-types/global')
  })
})
