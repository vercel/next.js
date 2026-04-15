import { nextTestSetup, isNextDev } from 'e2e-utils'
import cheerio from 'cheerio'

describe('env-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      PROCESS_ENV_KEY: 'processenvironment',
      ENV_FILE_PROCESS_ENV: 'env-cli',
    },
  })

  const getEnvFromHtml = async (path: string) => {
    const html = await next.render(path)
    const $ = cheerio.load(html)
    const env = JSON.parse($('p').text())
    env.nextConfigEnv = $('#nextConfigEnv').text()
    env.nextConfigPublicEnv = $('#nextConfigPublicEnv').text()
    env.nextConfigNewPublicEnv = $('#nextConfigNewPublicEnv').text()
    return env
  }

  const checkEnvData = (data: Record<string, string | undefined>) => {
    expect(data.ENV_FILE_KEY).toBe('env')
    expect(data.LOCAL_ENV_FILE_KEY).toBe(undefined)
    expect(data.DEVELOPMENT_ENV_FILE_KEY).toBe(
      isNextDev ? 'development' : undefined
    )
    expect(data.LOCAL_DEVELOPMENT_ENV_FILE_KEY).toBe(undefined)
    expect(data.TEST_ENV_FILE_KEY).toBe(undefined)
    expect(data.LOCAL_TEST_ENV_FILE_KEY).toBe(undefined)
    expect(data.PRODUCTION_ENV_FILE_KEY).toBe(
      isNextDev ? undefined : 'production'
    )
    expect(data.LOCAL_PRODUCTION_ENV_FILE_KEY).toBe(undefined)
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
      isNextDev ? 'development' : 'env'
    )
    expect(data.ENV_FILE_TEST_OVERRIDE_TEST).toEqual('env')
    expect(data.ENV_FILE_TEST_LOCAL_OVERRIDEOVERRIDE_TEST).toBe('env')
    expect(data.LOCAL_ENV_FILE_KEY).toBe(undefined)
    expect(data.ENV_FILE_PRODUCTION_OVERRIDEOVERRIDE_TEST).toEqual(
      isNextDev ? 'env' : 'production'
    )
    expect(data.ENV_FILE_PRODUCTION_LOCAL_OVERRIDEOVERRIDE_TEST).toEqual(
      isNextDev ? 'env' : 'production'
    )
    expect(data.NEXT_PUBLIC_EMPTY_ENV_VAR).toEqual('')

    const browser = await next.browser('/')
    expect(
      await browser.waitForElementByCss('#nextPublicEmptyEnvVar').text()
    ).toBe('content:')
  })
})
