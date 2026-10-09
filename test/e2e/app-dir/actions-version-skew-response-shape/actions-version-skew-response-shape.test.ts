import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

/**
 * A long-lived browser session can outlive the deployment that served it. When
 * the page was served by a pre-16.4 client build and the action request is
 * handled by a newer server, the older client decodes the action response with
 * `normalizeFlightData(response.f)`.
 *
 * These tests pin the current (buggy) response shape: the server answers 200
 * without the `f` field and without any version-mismatch signal, so the older
 * decoder dereferences a missing field and the action promise rejects with a
 * `TypeError` instead of recovering or surfacing a version mismatch.
 */
describe('server action response shape for older (pre-16.4) clients', () => {
  const { next } = nextTestSetup({ files: __dirname })

  /**
   * Verbatim copy of the decoding path shipped in next@16.3.8
   * (`client/flight-data-helpers.js` -> `normalizeFlightData`), which
   * `server-action-reducer.js` calls as `normalizeFlightData(response.f)`.
   */
  function normalizeFlightDataAsIn1638(flightData: unknown) {
    if (typeof flightData === 'string') {
      return flightData
    }
    return (flightData as unknown[]).map((flightDataPath) => flightDataPath)
  }

  async function invokeActionAndCaptureResponse() {
    let status: number | undefined
    let body: string | undefined

    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        page.route('**/*', async (route) => {
          const request = route.request()
          const headers = await request.allHeaders()
          if (request.method() !== 'POST' || !headers['next-action']) {
            await route.continue()
            return
          }

          const response = await route.fetch()
          status = response.status()
          body = await response.text()
          await route.fulfill({ response, body })
        })
      },
    })

    await browser.elementById('invoke-action').click()

    await retry(async () => {
      expect(await browser.elementById('result').text()).toBe(
        'hello from the server action'
      )
    })

    expect(typeof body).toBe('string')

    // The action response is a Flight stream; row `0` holds the
    // `ActionFlightResponse` object.
    const firstRow = body!.split('\n').find((line) => line.startsWith('0:'))!
    expect(firstRow).toBeDefined()

    return {
      status,
      payload: JSON.parse(firstRow.slice('0:'.length)) as Record<
        string,
        unknown
      >,
    }
  }

  it('answers 200 with an action payload that omits the `f` field', async () => {
    const { status, payload } = await invokeActionAndCaptureResponse()

    expect(status).toBe(200)
    // The action result itself is present, so the request was accepted.
    expect(payload).toHaveProperty('a')
    // Current behavior: no `f` (flightData) field is emitted at all, and
    // nothing else in the payload marks it as incompatible with an older
    // client. A fix that keeps older clients working (or that makes the
    // mismatch detectable) has to change this expectation.
    expect(Object.keys(payload)).not.toContain('f')
  })

  it('makes the pre-16.4 decoder throw a missing-field TypeError', async () => {
    const { payload } = await invokeActionAndCaptureResponse()

    // next@16.3.8 always received `f: ''` here, which the string branch
    // returned early. With `f` missing, the same helper calls `.map()` on
    // `undefined`, which is the reported client-side rejection.
    expect(() => normalizeFlightDataAsIn1638(payload.f)).toThrow(
      new TypeError("Cannot read properties of undefined (reading 'map')")
    )
  })
})
