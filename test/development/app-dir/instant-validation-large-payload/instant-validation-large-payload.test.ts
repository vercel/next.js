import { nextTestSetup } from 'e2e-utils'
import {
  normalizeValidationUrl,
  parseValidationMessages,
  waitForValidation,
  waitForValidationEnd,
} from 'e2e-utils/instant-validation'
import type { ValidationStartEvent } from 'next/dist/server/app-render/dev-validation-events'
import { retry } from 'next-test-utils'

describe('instant-validation-large-payload', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
    },
  })

  function waitForValidationStart(
    targetUrl: string
  ): Promise<ValidationStartEvent> {
    const expectedUrl = normalizeValidationUrl(targetUrl)

    return new Promise((resolve) => {
      let output = ''
      const onStdout = (chunk: string) => {
        output += chunk
        const start = parseValidationMessages(output).find(
          (event) =>
            event.type === 'validation_start' &&
            normalizeValidationUrl(event.url) === expectedUrl
        )
        if (start) {
          next.off('stdout', onStdout)
          resolve(start)
        }
      }
      next.on('stdout', onStdout)
    })
  }

  it('keeps serving requests while validating a large partial fallback route', async () => {
    const warmupOutput = next.getCliOutputFromHere()
    const homeResponse = await next.fetch('/')
    expect(homeResponse.status).toBe(200)
    await waitForValidation(new URL('/', next.url).href, warmupOutput)
    expect(await (await next.fetch('/ping')).text()).toBe('pong')

    const getOutput = next.getCliOutputFromHere()
    const productPath =
      '/en/false/US/USD/metric/p/category/type/example-product'
    const validationStarted = waitForValidationStart(
      new URL(productPath, next.url).href
    )
    const productResponse = await next.fetch(productPath)
    expect(productResponse.status).toBe(200)
    const productBody = productResponse.text()

    const validation = await validationStarted

    const requestAt = performance.now() + 50
    await retry(
      () => expect(performance.now()).toBeGreaterThanOrEqual(requestAt),
      500,
      25
    )

    const concurrentResponse = await fetch(`${next.url}/ping`, {
      signal: AbortSignal.timeout(150),
    })
    expect(concurrentResponse.status).toBe(200)
    expect(await concurrentResponse.text()).toBe('pong')

    expect(await productBody).toContain('id="product"')

    await expect(
      waitForValidationEnd(validation, getOutput)
    ).resolves.toMatchObject({ type: 'validation_end' })
  })
})
