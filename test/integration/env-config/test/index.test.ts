/* eslint-env jest */

import url from 'url'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  fetchViaHTTP,
  check,
} from 'next-test-utils'

let app
let appPort
let output = ''
const appDir = join(__dirname, '../app')

const getEnvFromHtml = async (path) => {
  const html = await renderViaHTTP(appPort, path)
  const $ = cheerio.load(html)
  const env = JSON.parse($('p').text())
  env.nextConfigEnv = $('#nextConfigEnv').text()
  env.nextConfigPublicEnv = $('#nextConfigPublicEnv').text()
  env.nextConfigNewPublicEnv = $('#nextConfigNewPublicEnv').text()
  return env
}

const runTests = (mode = 'dev', didReload = false) => {
  const isDevOnly = mode === 'dev'
  const isTestEnv = mode === 'test'
  const isDev = isDevOnly || isTestEnv

  const checkEnvData = (data) => {
    expect(data.ENV_FILE_KEY).toBe('env')
    expect(data.LOCAL_ENV_FILE_KEY).toBe(!isTestEnv ? 'localenv' : undefined)
    expect(data.DEVELOPMENT_ENV_FILE_KEY).toBe(
      isDevOnly ? 'development' : undefined
    )
    expect(data.LOCAL_DEVELOPMENT_ENV_FILE_KEY).toBe(
      isDevOnly ? 'localdevelopment' : undefined
    )
    expect(data.TEST_ENV_FILE_KEY).toBe(isTestEnv ? 'test' : undefined)
    expect(data.LOCAL_TEST_ENV_FILE_KEY).toBe(
      isTestEnv ? 'localtest' : undefined
    )
    expect(data.PRODUCTION_ENV_FILE_KEY).toBe(isDev ? undefined : 'production')
    expect(data.LOCAL_PRODUCTION_ENV_FILE_KEY).toBe(
      isDev ? undefined : 'localproduction'
    )
    expect(data.ENV_FILE_EXPANDED).toBe('env')
    expect(data.ENV_FILE_EXPANDED_CONCAT).toBe('hello-env')
    expect(data.ENV_FILE_EXPANDED_ESCAPED).toBe('$ENV_FILE_KEY')
    expect(data.ENV_FILE_KEY_EXCLAMATION).toBe('hello!')
    expect(data.ENV_FILE_EMPTY_FIRST).toBe(isTestEnv ? '' : '$escaped')
    expect(data.ENV_FILE_PROCESS_ENV).toBe('env-cli')

    if (didReload) {
      expect(data.NEW_ENV_KEY).toBe('true')
      expect(data.NEW_ENV_LOCAL_KEY).toBe('hello')
      expect(data.NEW_ENV_DEV_KEY).toBe('from-dev')
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
    const res = await fetchViaHTTP(appPort, '/hello', undefined, {
      redirect: 'manual',
    })
    const { pathname } = url.parse(res.headers.get('location'))

    expect(res.status).toBe(307)
    expect(pathname).toBe('/another')
  })

  it('should inline global values during build', async () => {
    const browser = await webdriver(appPort, '/global')

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
    const data = JSON.parse(await renderViaHTTP(appPort, '/api/all'))
    checkEnvData(data)
  })

  it('should load env from .env', async () => {
    const data = await getEnvFromHtml('/')
    expect(data.ENV_FILE_KEY).toEqual('env')
    expect(data.ENV_FILE_DEVELOPMENT_OVERRIDE_TEST).toEqual(
      isDevOnly ? 'development' : 'env'
    )
    expect(data.ENV_FILE_DEVELOPMENT_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isDevOnly ? 'localdevelopment' : 'env'
    )
    expect(data.ENV_FILE_TEST_OVERRIDE_TEST).toEqual(isTestEnv ? 'test' : 'env')
    expect(data.ENV_FILE_TEST_LOCAL_OVERRIDEOVERRIDE_TEST).toBe(
      isTestEnv ? 'localtest' : 'env'
    )
    expect(data.LOCAL_ENV_FILE_KEY).toBe(isTestEnv ? undefined : 'localenv')
    expect(data.ENV_FILE_PRODUCTION_OVERRIDEOVERRIDE_TEST).toEqual(
      isDev ? 'env' : 'production'
    )
    expect(data.ENV_FILE_PRODUCTION_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isDev ? 'env' : 'localproduction'
    )
    expect(data.NEXT_PUBLIC_EMPTY_ENV_VAR).toEqual('')

    const browser = await webdriver(appPort, '/')
    // Verify that after hydration, the empty env var is not replaced by undefined
    expect(
      await browser.waitForElementByCss('#nextPublicEmptyEnvVar').text()
    ).toBe('content:')
  })
}

describe('Env Config', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        output = ''
        appPort = await findPort()
        app = await launchApp(appDir, appPort, {
          env: {
            PROCESS_ENV_KEY: 'processenvironment',
            ENV_FILE_PROCESS_ENV: 'env-cli',
          },
          onStdout(msg) {
            output += msg || ''
          },
          onStderr(msg) {
            output += msg || ''
          },
        })

        await renderViaHTTP(appPort, '/another-global')
      })
      afterAll(() => killApp(app))

      runTests('dev')

      describe('with hot reload', () => {
        const originalContents = []
        beforeAll(async () => {
          const outputIndex = output.length
          const envFiles = (await fs.readdir(appDir)).filter((file) =>
            file.startsWith('.env')
          )
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
            const filePath = join(appDir, file)
            const content = await fs.readFile(filePath, 'utf8')
            originalContents.push({ file, content })

            const toUpdate = envToUpdate.find((item) => item.file === file)
            if (toUpdate) {
              await fs.writeFile(filePath, content + `\n${toUpdate.toAdd}`)
            }
          }
          await check(() => {
            return output.substring(outputIndex)
          }, /Reload env:/)
        })
        afterAll(async () => {
          for (const { file, content } of originalContents) {
            await fs.writeFile(join(appDir, file), content)
          }
        })

        runTests('dev', true)

        it('should have updated runtime values after change', async () => {
          let html = await fetchViaHTTP(appPort, '/').then((res) => res.text())
          let renderedEnv = JSON.parse(cheerio.load(html)('p').text())

          expect(renderedEnv['ENV_FILE_KEY']).toBe('env')
          expect(renderedEnv['ENV_FILE_LOCAL_OVERRIDE_TEST']).toBe('localenv')
          let outputIdx = output.length

          const envFile = join(appDir, '.env')
          const envLocalFile = join(appDir, '.env.local')
          const envContent = originalContents.find(
            (item) => item.file === '.env'
          ).content
          const envLocalContent = originalContents.find(
            (item) => item.file === '.env.local'
          ).content

          try {
            await fs.writeFile(
              envFile,
              envContent.replace(`ENV_FILE_KEY=env`, `ENV_FILE_KEY=env-updated`)
            )

            // we should only log we loaded new env from .env
            await check(() => output.substring(outputIdx), /Reload env:/)
            expect(
              [...output.substring(outputIdx).matchAll(/Reload env:/g)].length
            ).toBe(1)
            expect(output.substring(outputIdx)).not.toContain('.env.local')

            await check(async () => {
              html = await fetchViaHTTP(appPort, '/').then((res) => res.text())
              renderedEnv = JSON.parse(cheerio.load(html)('p').text())
              expect(renderedEnv['ENV_FILE_KEY']).toBe('env-updated')
              expect(renderedEnv['ENV_FILE_LOCAL_OVERRIDE_TEST']).toBe(
                'localenv'
              )
              return 'success'
            }, 'success')

            outputIdx = output.length

            await fs.writeFile(
              envLocalFile,
              envLocalContent.replace(
                `ENV_FILE_LOCAL_OVERRIDE_TEST=localenv`,
                `ENV_FILE_LOCAL_OVERRIDE_TEST=localenv-updated`
              )
            )

            // we should only log we loaded new env from .env
            await check(() => output.substring(outputIdx), /Reload env:/)
            expect(
              [...output.substring(outputIdx).matchAll(/Reload env:/g)].length
            ).toBe(1)
            expect(output.substring(outputIdx)).toContain('.env.local')

            await check(async () => {
              html = await fetchViaHTTP(appPort, '/').then((res) => res.text())
              renderedEnv = JSON.parse(cheerio.load(html)('p').text())
              expect(renderedEnv['ENV_FILE_KEY']).toBe('env-updated')
              expect(renderedEnv['ENV_FILE_LOCAL_OVERRIDE_TEST']).toBe(
                'localenv-updated'
              )
              return 'success'
            }, 'success')
          } finally {
            await fs.writeFile(envFile, envContent)
            await fs.writeFile(envLocalFile, envLocalContent)
          }
        })

        it('should trigger HMR correctly when NEXT_PUBLIC_ env is changed', async () => {
          const envFile = join(appDir, '.env')
          const envLocalFile = join(appDir, '.env.local')
          const envContent = originalContents.find(
            (item) => item.file === '.env'
          ).content
          const envLocalContent = originalContents.find(
            (item) => item.file === '.env.local'
          ).content

          try {
            const browser = await webdriver(appPort, '/global')
            expect(
              await browser.waitForElementByCss('#global-value').text()
            ).toBe('another')

            let outputIdx = output.length

            await fs.writeFile(
              envFile,
              envContent.replace(
                `NEXT_PUBLIC_TEST_DEST=another`,
                `NEXT_PUBLIC_TEST_DEST=replaced`
              )
            )
            // we should only log we loaded new env from .env
            await check(() => output.substring(outputIdx), /Reload env:/)
            expect(
              [...output.substring(outputIdx).matchAll(/Reload env:/g)].length
            ).toBe(1)
            expect(output.substring(outputIdx)).not.toContain('.env.local')

            await check(
              () => browser.waitForElementByCss('#global-value').text(),
              'replaced'
            )

            outputIdx = output.length

            await fs.writeFile(
              envLocalFile,
              envLocalContent + `\nNEXT_PUBLIC_TEST_DEST=overridden`
            )
            // we should only log we loaded new env from .env
            await check(() => output.substring(outputIdx), /Reload env:/)
            expect(
              [...output.substring(outputIdx).matchAll(/Reload env:/g)].length
            ).toBe(1)
            expect(output.substring(outputIdx)).toContain('.env.local')

            await check(
              () => browser.waitForElementByCss('#global-value').text(),
              'overridden'
            )

            outputIdx = output.length

            await fs.writeFile(envLocalFile, envLocalContent)
            // we should only log we loaded new env from .env
            await check(() => output.substring(outputIdx), /Reload env:/)
            expect(
              [...output.substring(outputIdx).matchAll(/Reload env:/g)].length
            ).toBe(1)
            expect(output.substring(outputIdx)).toContain('.env.local')

            await check(() => browser.elementByCss('p').text(), 'replaced')
          } finally {
            await fs.writeFile(envFile, envContent)
            await fs.writeFile(envLocalFile, envLocalContent)
          }
        })
      })
    }
  )

  describe('test environment', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        env: {
          PROCESS_ENV_KEY: 'processenvironment',
          NODE_ENV: 'test',
          ENV_FILE_PROCESS_ENV: 'env-cli',
        },
      })
    })
    afterAll(() => killApp(app))

    runTests('test')
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        const { code } = await nextBuild(appDir, [], {
          env: {
            PROCESS_ENV_KEY: 'processenvironment',
            ENV_FILE_PROCESS_ENV: 'env-cli',
          },
        })
        if (code !== 0) throw new Error(`Build failed with exit code ${code}`)

        appPort = await findPort()
        app = await nextStart(appDir, appPort, {
          env: {
            ENV_FILE_PROCESS_ENV: 'env-cli',
          },
        })
      })
      afterAll(() => killApp(app))

      runTests('server')
    }
  )
})
