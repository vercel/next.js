import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs/promises'
import { join } from 'path'
import { outdent } from 'outdent'

describe('app-dir env-config', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    env: {
      PROCESS_ENV_KEY: 'processenvironment',
      ENV_FILE_PROCESS_ENV: 'env-cli',
    },
  })

  const getEnvFromHtml = async (path: string) => {
    const $ = await next.render$(path)
    const env = JSON.parse($('p').text())
    env.nextConfigEnv = $('#nextConfigEnv').text()
    env.nextConfigPublicEnv = $('#nextConfigPublicEnv').text()
    env.nextConfigNewPublicEnv = $('#nextConfigNewPublicEnv').text()
    return env
  }

  const checkEnvData = (data: Record<string, string | undefined>) => {
    expect(data.ENV_FILE_KEY).toBe('env')
    expect(data.LOCAL_ENV_FILE_KEY).toBe('localenv')
    expect(data.DEVELOPMENT_ENV_FILE_KEY).toBe(
      isNextDev ? 'development' : undefined
    )
    expect(data.LOCAL_DEVELOPMENT_ENV_FILE_KEY).toBe(
      isNextDev ? 'localdevelopment' : undefined
    )
    expect(data.PRODUCTION_ENV_FILE_KEY).toBe(
      isNextDev ? undefined : 'production'
    )
    expect(data.LOCAL_PRODUCTION_ENV_FILE_KEY).toBe(
      isNextDev ? undefined : 'localproduction'
    )
    expect(data.ENV_FILE_EXPANDED).toBe('env')
    expect(data.ENV_FILE_EXPANDED_CONCAT).toBe('hello-env')
    expect(data.ENV_FILE_EXPANDED_ESCAPED).toBe('$ENV_FILE_KEY')
    expect(data.ENV_FILE_KEY_EXCLAMATION).toBe('hello!')
    expect(data.ENV_FILE_EMPTY_FIRST).toBe('$escaped')
    expect(data.ENV_FILE_PROCESS_ENV).toBe('env-cli')

    expect(data.nextConfigEnv).toBe('hello from next.config.js')
    expect(data.nextConfigPublicEnv).toBe('hello again from next.config.js')
    expect(data.nextConfigNewPublicEnv).toBe('hello set in next.config.js')
  }

  it('should have process environment override .env', async () => {
    const data = await getEnvFromHtml('/')

    // content streams in
    await retry(() => {
      expect(data.PROCESS_ENV_KEY).toEqual('processenvironment')
    })
  })

  it('should provide global env to next.config.js', async () => {
    const res = await next.fetch('/hello', { redirect: 'manual' })
    const { pathname } = new URL(res.headers.get('location')!, 'http://n')

    expect(res.status).toBe(307)
    expect(pathname).toBe('/another')
  })

  it('should inline global values during build', async () => {
    const browser = await next.browser('/global')

    expect(await browser.waitForElementByCss('#global-value').text()).toBe(
      'another'
    )
  })

  it('should provide env for static server component', async () => {
    const data = await getEnvFromHtml('/static')
    checkEnvData(data)
  })

  it('should provide env correctly for dynamic server component', async () => {
    const data = await getEnvFromHtml('/dynamic')

    // content streams in
    await retry(() => {
      checkEnvData(data)
    })
  })

  it('should provide env correctly for route handlers', async () => {
    const data = await next.fetch('/api/all').then((res) => res.json())
    checkEnvData(data)
  })

  it('should load env from .env', async () => {
    const data = await getEnvFromHtml('/')

    // content streams in
    await retry(() => {
      expect(data.ENV_FILE_KEY).toEqual('env')
    })
    expect(data.ENV_FILE_DEVELOPMENT_OVERRIDE_TEST).toEqual(
      isNextDev ? 'development' : 'env'
    )
    expect(data.ENV_FILE_DEVELOPMENT_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isNextDev ? 'localdevelopment' : 'env'
    )
    expect(data.ENV_FILE_PRODUCTION_OVERRIDEOVERRIDE_TEST).toEqual(
      isNextDev ? 'env' : 'production'
    )
    expect(data.ENV_FILE_PRODUCTION_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isNextDev ? 'env' : 'localproduction'
    )
    expect(data.LOCAL_ENV_FILE_KEY).toBe('localenv')
    expect(data.NEXT_PUBLIC_EMPTY_ENV_VAR).toEqual('')

    const browser = await next.browser('/')

    // content streams in
    await retry(async () => {
      expect(
        await browser.elementByCssInstant('#nextPublicEmptyEnvVar').text()
      ).toBe('content:')
    })
  })

  it('should use a consistent value across static, dynamic, and cached environments', async () => {
    const browser = await next.browser('/ppr')

    await retry(async () => {
      const text = await browser
        .elementByCssInstant('[data-testid="inspect-env"]')
        .text()
      expect(text).toEqual(
        outdent`
          static ENV_FILE_KEY: env
          dynamic ENV_FILE_KEY: env
          cached ENV_FILE_KEY: env
        `
      )
    })
  })

  if (isNextDev) {
    describe('with hot reload', () => {
      let originalContents: Array<{ file: string; content: string }> = []

      beforeAll(async () => {
        const testDir = next.testDir
        const envFiles = (await fs.readdir(testDir)).filter((file) =>
          file.startsWith('.env')
        )
        originalContents = []
        const envToUpdate = [
          {
            toAdd: 'NEW_ENV_KEY=true',
            file: '.env',
          },
          {
            toAdd: 'NEW_ENV_LOCAL_KEY=hello',
            file: '.env.local',
          },
          {
            toAdd: 'NEW_ENV_DEV_KEY=from-dev\nNEXT_PUBLIC_HELLO_WORLD=again',
            file: '.env.development',
          },
        ]

        for (const file of envFiles) {
          const filePath = join(testDir, file)
          const content = await fs.readFile(filePath, 'utf8')
          originalContents.push({ file, content })

          const toUpdate = envToUpdate.find((item) => item.file === file)
          if (toUpdate) {
            await fs.writeFile(filePath, content + `\n${toUpdate.toAdd}`)
          }
        }
        await retry(() => {
          expect(next.cliOutput).toContain('Reload env:')
        })
      })
      afterAll(async () => {
        const testDir = next.testDir
        for (const { file, content } of originalContents) {
          await fs.writeFile(join(testDir, file), content)
        }
      })

      it('should have new env values after .env file change', async () => {
        const data = await getEnvFromHtml('/')

        // content streams in
        await retry(() => {
          checkEnvData(data)
        })
        expect(data.NEW_ENV_KEY).toBe('true')
        expect(data.NEW_ENV_LOCAL_KEY).toBe('hello')
        expect(data.NEW_ENV_DEV_KEY).toBe('from-dev')
      })
    })
  }
})
