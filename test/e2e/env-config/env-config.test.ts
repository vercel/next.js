import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'

describe('env-config', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    env: {
      PROCESS_ENV_KEY: 'processenvironment',
      ENV_FILE_PROCESS_ENV: 'env-cli',
    },
    skipDeployment: true,
  })
  if (skipped) return

  const getEnvFromHtml = async (path: string) => {
    const html = await next.render(path)
    const $ = cheerio.load(html)
    const env = JSON.parse($('p').text())
    env.nextConfigEnv = $('#nextConfigEnv').text()
    env.nextConfigPublicEnv = $('#nextConfigPublicEnv').text()
    env.nextConfigNewPublicEnv = $('#nextConfigNewPublicEnv').text()
    return env
  }

  const checkEnvData = (
    data: Record<string, string | undefined>,
    didReload = false
  ) => {
    expect(data.ENV_FILE_KEY).toBe('env')
    expect(data.LOCAL_ENV_FILE_KEY).toBe('localenv')
    expect(data.DEVELOPMENT_ENV_FILE_KEY).toBe(
      isNextDev ? 'development' : undefined
    )
    expect(data.LOCAL_DEVELOPMENT_ENV_FILE_KEY).toBe(
      isNextDev ? 'localdevelopment' : undefined
    )
    expect(data.TEST_ENV_FILE_KEY).toBe(undefined)
    expect(data.LOCAL_TEST_ENV_FILE_KEY).toBe(undefined)
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

    if (didReload) {
      expect(data.NEW_ENV_KEY).toBe('true')
      expect(data.NEW_ENV_LOCAL_KEY).toBe('hello')
      expect(data.NEW_ENV_DEV_KEY).toBe('from-dev')
      expect(data.NEXT_PUBLIC_HELLO_WORLD).toBe('again')
    }

    expect(data.nextConfigEnv).toBe('hello from next.config.js')
    expect(data.nextConfigPublicEnv).toBe('hello again from next.config.js')
    expect(data.nextConfigNewPublicEnv).toBe('hello set in next.config.js')
  }

  it('should have process environment override .env', async () => {
    const data = await getEnvFromHtml('/')
    expect(data.PROCESS_ENV_KEY).toEqual('processenvironment')
  })

  it('should provide global env to next.config.js', async () => {
    const res = await next.fetch('/hello', { redirect: 'manual' })
    const { pathname } = new URL(res.headers.get('location')!)
    expect(res.status).toBe(307)
    expect(pathname).toBe('/another')
  })

  it('should inline global values during build', async () => {
    const browser = await next.browser('/global')
    expect(await browser.waitForElementByCss('#global-value').text()).toBe(
      'another'
    )
  })

  it('should provide env for SSG', async () => {
    const data = await getEnvFromHtml('/some-ssg')
    checkEnvData(data)
  })

  it('should provide env correctly for SSR', async () => {
    const data = await getEnvFromHtml('/some-ssp')
    checkEnvData(data)
  })

  it('should provide env correctly for API routes', async () => {
    const data = JSON.parse(await next.render('/api/all'))
    checkEnvData(data)
  })

  it('should load env from .env', async () => {
    const data = await getEnvFromHtml('/')
    expect(data.ENV_FILE_KEY).toEqual('env')
    expect(data.ENV_FILE_DEVELOPMENT_OVERRIDE_TEST).toEqual(
      isNextDev ? 'development' : 'env'
    )
    expect(data.ENV_FILE_DEVELOPMENT_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isNextDev ? 'localdevelopment' : 'env'
    )
    expect(data.ENV_FILE_TEST_OVERRIDE_TEST).toEqual('env')
    expect(data.ENV_FILE_TEST_LOCAL_OVERRIDEOVERRIDE_TEST).toBe('env')
    expect(data.LOCAL_ENV_FILE_KEY).toBe('localenv')
    expect(data.ENV_FILE_PRODUCTION_OVERRIDEOVERRIDE_TEST).toEqual(
      isNextDev ? 'env' : 'production'
    )
    expect(data.ENV_FILE_PRODUCTION_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isNextDev ? 'env' : 'localproduction'
    )
    expect(data.NEXT_PUBLIC_EMPTY_ENV_VAR).toEqual('')

    const browser = await next.browser('/')
    expect(
      await browser.waitForElementByCss('#nextPublicEmptyEnvVar').text()
    ).toBe('content:')
  })

  if (isNextDev) {
    describe('with hot reload', () => {
      it('should have updated runtime values after change', async () => {
        const envContent = await next.readFile('.env')
        const envDevContent = await next.readFile('.env.development')
        const envLocalContent = await next.readFile('.env.local')

        try {
          const initialData = await getEnvFromHtml('/')
          expect(initialData.ENV_FILE_KEY).toBe('env')

          await next.patchFile('.env', envContent + '\nNEW_ENV_KEY=true')
          await next.patchFile(
            '.env.local',
            envLocalContent + '\nNEW_ENV_LOCAL_KEY=hello'
          )
          await next.patchFile(
            '.env.development',
            envDevContent +
              '\nNEW_ENV_DEV_KEY=from-dev\nNEXT_PUBLIC_HELLO_WORLD=again'
          )

          await retry(async () => {
            expect(next.cliOutput).toContain('Reload env:')
          })

          await retry(async () => {
            const data = await getEnvFromHtml('/')
            expect(data.NEW_ENV_KEY).toBe('true')
            expect(data.NEW_ENV_LOCAL_KEY).toBe('hello')
            expect(data.NEW_ENV_DEV_KEY).toBe('from-dev')
            expect(data.NEXT_PUBLIC_HELLO_WORLD).toBe('again')
          })

          // Re-verify base env data with didReload=true
          const ssgData = await getEnvFromHtml('/some-ssg')
          checkEnvData(ssgData, true)
          const sspData = await getEnvFromHtml('/some-ssp')
          checkEnvData(sspData, true)
          const apiData = JSON.parse(await next.render('/api/all'))
          checkEnvData(apiData, true)

          const outputBefore = next.cliOutput.length
          await next.patchFile(
            '.env',
            envContent.replace('ENV_FILE_KEY=env', 'ENV_FILE_KEY=env-updated') +
              '\nNEW_ENV_KEY=true'
          )

          await retry(async () => {
            const recentOutput = next.cliOutput.substring(outputBefore)
            expect(recentOutput).toContain('Reload env:')
          })
          const recentOutput = next.cliOutput.substring(outputBefore)
          expect([...recentOutput.matchAll(/Reload env:/g)].length).toBe(1)
          expect(recentOutput).not.toContain('.env.local')

          await retry(async () => {
            const data = await getEnvFromHtml('/')
            expect(data.ENV_FILE_KEY).toBe('env-updated')
            expect(data.NEW_ENV_KEY).toBe('true')
          })

          // Now modify .env.local and verify it's detected
          const outputBefore2 = next.cliOutput.length
          await next.patchFile(
            '.env.local',
            envLocalContent.replace(
              'ENV_FILE_LOCAL_OVERRIDE_TEST=localenv',
              'ENV_FILE_LOCAL_OVERRIDE_TEST=localenv-updated'
            )
          )

          await retry(async () => {
            const recentOutput2 = next.cliOutput.substring(outputBefore2)
            expect(recentOutput2).toContain('Reload env:')
          })
          expect(next.cliOutput.substring(outputBefore2)).toContain(
            '.env.local'
          )

          await retry(async () => {
            const data = await getEnvFromHtml('/')
            expect(data.ENV_FILE_KEY).toBe('env-updated')
            expect(data.ENV_FILE_LOCAL_OVERRIDE_TEST).toBe('localenv-updated')
          })
        } finally {
          await next.patchFile('.env', envContent)
          await next.patchFile('.env.development', envDevContent)
          await next.patchFile('.env.local', envLocalContent)
        }
      })

      it('should trigger HMR correctly when NEXT_PUBLIC_ env is changed', async () => {
        const envContent = await next.readFile('.env')
        const envLocalContent = await next.readFile('.env.local')

        try {
          const browser = await next.browser('/global')
          expect(
            await browser.waitForElementByCss('#global-value').text()
          ).toBe('another')

          let outputBefore = next.cliOutput.length
          await next.patchFile(
            '.env',
            envContent.replace(
              'NEXT_PUBLIC_TEST_DEST=another',
              'NEXT_PUBLIC_TEST_DEST=replaced'
            )
          )

          await retry(async () => {
            const recentOutput = next.cliOutput.substring(outputBefore)
            expect(recentOutput).toContain('Reload env:')
          })
          let recentOutput = next.cliOutput.substring(outputBefore)
          expect([...recentOutput.matchAll(/Reload env:/g)].length).toBe(1)
          expect(recentOutput).not.toContain('.env.local')

          await retry(async () => {
            expect(
              await browser.waitForElementByCss('#global-value').text()
            ).toBe('replaced')
          })

          // Override via .env.local
          outputBefore = next.cliOutput.length
          await next.patchFile(
            '.env.local',
            envLocalContent + '\nNEXT_PUBLIC_TEST_DEST=overridden'
          )

          await retry(async () => {
            recentOutput = next.cliOutput.substring(outputBefore)
            expect(recentOutput).toContain('Reload env:')
          })
          recentOutput = next.cliOutput.substring(outputBefore)
          expect([...recentOutput.matchAll(/Reload env:/g)].length).toBe(1)
          expect(recentOutput).toContain('.env.local')

          await retry(async () => {
            expect(
              await browser.waitForElementByCss('#global-value').text()
            ).toBe('overridden')
          })

          // Restore .env.local
          outputBefore = next.cliOutput.length
          await next.patchFile('.env.local', envLocalContent)

          await retry(async () => {
            recentOutput = next.cliOutput.substring(outputBefore)
            expect(recentOutput).toContain('Reload env:')
          })
          recentOutput = next.cliOutput.substring(outputBefore)
          expect([...recentOutput.matchAll(/Reload env:/g)].length).toBe(1)
          expect(recentOutput).toContain('.env.local')

          await retry(async () => {
            expect(
              await browser.waitForElementByCss('#global-value').text()
            ).toBe('replaced')
          })

          // Restore .env to original
          const outputBefore2 = next.cliOutput.length
          await next.patchFile('.env', envContent)

          await retry(async () => {
            const recentOutput2 = next.cliOutput.substring(outputBefore2)
            expect(recentOutput2).toContain('Reload env:')
          })

          await retry(async () => {
            expect(await browser.elementByCss('#global-value').text()).toBe(
              'another'
            )
          })
        } finally {
          await next.patchFile('.env', envContent)
          await next.patchFile('.env.local', envLocalContent)
        }
      })
    })
  }
})
