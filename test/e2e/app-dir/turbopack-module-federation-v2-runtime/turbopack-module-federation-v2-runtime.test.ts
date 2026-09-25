import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const describeTurbopack =
  process.env.IS_TURBOPACK_TEST && !process.env.__NEXT_CACHE_COMPONENTS
    ? describe
    : describe.skip

describeTurbopack('enhanced federation runtime configuration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: { name: 'inferred-federation-host' },
    dependencies: { '@module-federation/runtime-tools': '2.9.0' },
  })

  it('accepts JSON runtime-plugin params and rejects values that cannot be serialized', () => {
    // Loading the schema at runtime avoids coupling this test to its generated .d.ts.
    const { configSchema } = require('next/dist/server/config-schema') as {
      configSchema: { safeParse: (value: unknown) => { success: boolean } }
    }
    const valid = (params: unknown) =>
      configSchema.safeParse({
        experimental: {
          turbopackModuleFederation: {
            name: 'host',
            runtimePlugins: [['./plugin.js', params]],
          },
        },
      }).success

    for (const params of [
      null,
      false,
      42,
      'value',
      ['x', 2],
      { nested: [null, true] },
    ]) {
      expect(valid(params)).toBe(true)
    }
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const params of [undefined, NaN, () => {}, cyclic, new Date()]) {
      expect(valid(params)).toBe(false)
    }
  })

  it('infers a host-only name from the project package and initializes one instance', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(
        await browser.eval(
          `globalThis.__FEDERATION__?.__INSTANCES__?.filter((instance) => instance.name === 'inferred-federation-host').length`
        )
      ).toBe(1)
    })
  })
})

// The override is set in process.env before a local build; deployed builds cannot use this
// per-test setting. The default runtime package case above still runs in deployment mode.
const describeOverride = !isNextDeploy ? describeTurbopack : describe.skip

describeOverride('enhanced federation runtime implementation override', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: { name: 'override-federation-host' },
    dependencies: {
      'custom-runtime': 'npm:@module-federation/runtime-tools@2.9.0',
    },
    skipStart: true,
    skipDeployment: true,
  })

  beforeAll(async () => {
    process.env.MF_RUNTIME_OVERRIDE = 'custom-runtime'
    await next.start()
  })

  afterAll(() => {
    delete process.env.MF_RUNTIME_OVERRIDE
  })

  it('uses the project implementation and loaded-first sharing', async () => {
    const browser = await next.browser('/')
    const result = await browser.eval(`(async () => {
      const instance = globalThis.__FEDERATION__?.__INSTANCES__?.find((item) => item.name === 'override-federation-host');
      if (!instance) return { error: 'missing instance' };
      const first = await instance.loadShare('local-value');
      instance.registerShared({ 'local-value': {
        version: '2.0.0',
        get: () => () => ({ value: 'higher but not loaded' }),
        shareConfig: { requiredVersion: false, singleton: true },
        scope: ['default']
      } });
      const second = await instance.loadShare('local-value');
      return {
        name: instance.name,
        strategy: instance.options.shareStrategy,
        first: first().value,
        second: second().value
      };
    })()`)
    expect(result).toEqual({
      name: 'override-federation-host',
      strategy: 'loaded-first',
      first: 'locally loaded provider',
      second: 'locally loaded provider',
    })
  })
})

// A missing runtime package is an intentionally invalid self-hosted installation and cannot
// produce a deployable fixture. The positive case above still exercises deployed builds.
const describeMissingRuntime = !isNextDeploy ? describeTurbopack : describe.skip

describeMissingRuntime('enhanced federation runtime missing package', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    packageJson: { name: 'inferred-federation-host' },
    skipStart: true,
    skipDeployment: true,
  })

  it('explains which runtime package must be installed', async () => {
    await next.start().catch(() => undefined)
    if (isNextDev) await next.render('/').catch(() => undefined)
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'Module Federation requires @module-federation/runtime-tools@^2.9.0'
      )
    })
  })
})
