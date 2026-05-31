import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

type Span = {
  label: string
  start: number
  end: number
  value?: number
}

// Two server-measured intervals that overlap ran concurrently.
function anyOverlap(spans: Span[]): boolean {
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (spans[i].start < spans[j].end && spans[j].start < spans[i].end) {
        return true
      }
    }
  }
  return false
}

describe('parallel Server Functions', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function readJson(browser: any, testid: string): Promise<any> {
    return JSON.parse(
      await browser.elementByCss(`[data-testid=${testid}]`).text()
    )
  }

  it('should run Cache Functions in parallel', async () => {
    const browser = await next.browser('/reads')
    await browser.elementByCss('[data-testid=fire-cache]').click()
    await retry(async () => {
      const spans: Span[] = await readJson(browser, 'out-cache')
      expect(spans).toHaveLength(3)
      expect(anyOverlap(spans)).toBe(true)
    })
  })

  it('should run read Server Actions in parallel, each returning its own value', async () => {
    const browser = await next.browser('/reads')
    await browser.elementByCss('[data-testid=fire-read]').click()
    await retry(async () => {
      const spans: Span[] = await readJson(browser, 'out-read')
      expect(spans).toHaveLength(3)
      expect(anyOverlap(spans)).toBe(true)
      expect(spans.map((s) => s.label.split('-')[0]).sort()).toEqual([
        'r1',
        'r2',
        'r3',
      ])
    })
  })

  it('should run mixed Cache Function and Server Action calls in parallel', async () => {
    const browser = await next.browser('/reads')
    await browser.elementByCss('[data-testid=fire-mixed]').click()
    await retry(async () => {
      const spans: Span[] = await readJson(browser, 'out-mixed')
      expect(spans).toHaveLength(3)
      expect(anyOverlap(spans)).toBe(true)
    })
  })

  it('should run mutating Server Actions in parallel, each writing its own state', async () => {
    const browser = await next.browser('/mutations')
    await browser.elementByCss('[data-testid=fire-mutations]').click()
    await retry(async () => {
      const spans: Span[] = await readJson(browser, 'out-mutations')
      expect(spans).toHaveLength(3)
      expect(anyOverlap(spans)).toBe(true)
      expect(spans.map((s) => s.label).sort()).toEqual(['a', 'b', 'c'])
    })
    // Every call kept its own write (no lost update). Cookies live in the
    // browser, so this holds on deploy too.
    await retry(async () => {
      const cookie: string = await browser.eval('document.cookie')
      expect(cookie).toContain('psf-mut-a=')
      expect(cookie).toContain('psf-mut-b=')
      expect(cookie).toContain('psf-mut-c=')
    })
  })

  it('should resolve a fast call before a slow one fired together', async () => {
    const browser = await next.browser('/reads')
    await browser.elementByCss('[data-testid=fire-order]').click()
    await retry(async () => {
      const order: string[] = await readJson(browser, 'out-order')
      expect(order).toHaveLength(2)
      expect(order[0]).toBe('fast')
    })
  })

  it('should not make a Cache Function wait behind a mutation', async () => {
    const browser = await next.browser('/mutations')
    await browser.elementByCss('[data-testid=fire-cache-vs-mutation]').click()
    await retry(async () => {
      const spans: Span[] = await readJson(browser, 'out-cache-vs-mutation')
      expect(spans).toHaveLength(2)
      expect(anyOverlap(spans)).toBe(true)
    })
  })

  // Redirecting from a Server Action is already covered by the actions suite;
  // this just re-checks it through the parallel commit path.
  // TODO: remove once parallel is the default.
  it('should navigate when a Server Action redirects', async () => {
    const browser = await next.browser('/reads')
    await browser.elementByCss('[data-testid=fire-redirect]').click()
    await retry(async () => {
      expect(await browser.url()).toContain('/mutations')
    })
  })

  it('should keep useActionState dispatches serial', async () => {
    const browser = await next.browser('/opt-out')
    await browser.elementByCss('[data-testid=fire-uas]').click()
    await retry(async () => {
      expect(await readJson(browser, 'out-uas')).toHaveLength(3)
    })
    expect(anyOverlap(await readJson(browser, 'out-uas'))).toBe(false)
  })

  it('should run awaited calls sequentially', async () => {
    const browser = await next.browser('/opt-out')
    await browser.elementByCss('[data-testid=fire-await]').click()
    await retry(async () => {
      expect(await readJson(browser, 'out-await')).toHaveLength(3)
    })
    expect(anyOverlap(await readJson(browser, 'out-await'))).toBe(false)
  })

  it('should not block other calls when one fails', async () => {
    const browser = await next.browser('/reads')
    await browser.elementByCss('[data-testid=fire-error]').click()
    await retry(async () => {
      const statuses: string[] = await readJson(browser, 'out-error')
      expect(statuses).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    })
  })

  it('should run a large fan-out in parallel', async () => {
    const browser = await next.browser('/reads')
    await browser.elementByCss('[data-testid=fire-large]').click()
    await retry(async () => {
      const spans: Span[] = await readJson(browser, 'out-large')
      expect(spans).toHaveLength(10)
      expect(anyOverlap(spans)).toBe(true)
    })
  })

  it('should run bound-arg Server Actions in parallel', async () => {
    const browser = await next.browser('/reads')
    await browser.elementByCss('[data-testid=fire-bound]').click()
    await retry(async () => {
      const spans: Span[] = await readJson(browser, 'out-bound')
      expect(spans).toHaveLength(3)
      expect(anyOverlap(spans)).toBe(true)
    })
  })

  it('should not commit a Server Action after navigation superseded mid-flight', async () => {
    const browser = await next.browser('/origin')
    expect(await browser.elementByCss('[data-testid=content]').text()).toBe(
      'Origin'
    )

    // Start the slow action, then go to "/destination" before it finishes. The
    // navigation lands first.
    await browser.elementByCss('[data-testid=fire-race]').click()

    await retry(async () => {
      expect(await browser.url()).toContain('/destination')
      expect(await browser.elementByCss('[data-testid=content]').text()).toBe(
        'Destination'
      )
    })

    // When the action finishes ~1s later, its result was built for the old
    // "/origin" page. Applied to "/destination" it would flip the text back to
    // "Origin", so it's ignored and "/destination" is refetched instead. We poll
    // for that bad flip directly (retry() would stop at the first good read and
    // miss a later flip). 4s easily covers the action's 1s delay.
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      expect(await browser.elementByCss('[data-testid=content]').text()).toBe(
        'Destination'
      )
      await waitFor(50)
    }

    // Make sure the action actually finished, so the check above means something:
    // a hung action would also leave the text unchanged and pass for the wrong
    // reason. The flag lives on `window`, which survives the SPA nav.
    await retry(async () => {
      expect(await browser.eval('Boolean(window.__raceActionSettled)')).toBe(
        true
      )
    })
  })

  it('should drop a raced Server Action redirect that the mid-flight navigation superseded', async () => {
    const browser = await next.browser('/origin')

    // Start the slow redirect, then go to "/destination" first. The redirect
    // resolves ~1.5s later, too late: the page already moved on.
    await browser.elementByCss('[data-testid=fire-redirect-race]').click()

    // The fast navigation lands first.
    await retry(async () => {
      expect(await browser.url()).toContain('/destination')
    })

    // Being stale, the redirect is dropped: we stay on "/destination" and never
    // go to "/mutations".
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      expect(await browser.url()).toContain('/destination')
      await waitFor(50)
    }

    // Make sure the redirect actually ran (so this isn't passing just because
    // nothing happened). A redirect rejects its caller; the trigger records that
    // on `window`, which survives the SPA nav.
    await retry(async () => {
      expect(await browser.eval('Boolean(window.__redirectRaceSettled)')).toBe(
        true
      )
    })
  })

  it('should drop a raced Server Action external redirect that the mid-flight navigation superseded', async () => {
    const browser = await next.browser('/origin')

    // Same race, but the redirect points to another site, which would normally
    // force a full-page jump away from the app. The navigation to "/destination"
    // lands first; the redirect resolves ~1.5s later, already stale.
    await browser
      .elementByCss('[data-testid=fire-external-redirect-race]')
      .click()

    // The fast navigation lands first.
    await retry(async () => {
      expect(await browser.url()).toContain('/destination')
    })

    // Being stale, it's dropped: we stay on "/destination" and never jump to the
    // other site. Poll for that bad outcome directly (retry() would stop at the
    // first good read). 4s covers the ~1.5s delay.
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      const url = await browser.url()
      expect(url).toContain('/destination')
      expect(url).not.toContain('next-data-api-endpoint.vercel.app')
      await waitFor(50)
    }

    // Make sure the redirect actually ran (so this isn't passing just because
    // nothing happened). A redirect rejects its caller; the trigger records that
    // on `window`, which survives the SPA nav.
    await retry(async () => {
      expect(
        await browser.eval('Boolean(window.__externalRedirectRaceSettled)')
      ).toBe(true)
    })
  })

  it('should reconcile the UI to the final value after concurrent committing Server Actions', async () => {
    const browser = await next.browser('/reconcile')
    await browser.elementByCss('[data-testid=fire-reconcile]').click()

    // The three writing actions overlap on the network and each returns its own
    // value. Their delays differ, so the one writing 3 finishes last and the
    // final shared value is 3.
    await retry(async () => {
      const spans: Span[] = await readJson(browser, 'out-reconcile')
      expect(spans).toHaveLength(3)
      expect(anyOverlap(spans)).toBe(true)
      expect(spans.map((s) => s.value).sort((a, b) => a! - b!)).toEqual([
        1, 2, 3,
      ])
    })

    // A dynamic component reads that shared value. Once the commits settle, the
    // UI must catch up to the last write, 3 (the first commit applies its data,
    // the later two are stale and refetch). If reconcile is broken, it gets stuck
    // on an earlier value. Wide window for the refresh.
    await retry(async () => {
      expect(
        await browser.elementByCss('[data-testid=reconciled]').text()
      ).toBe('3')
    }, 10000)
  })
})
