/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { BrowserInterface } from 'next-webdriver'

const WITH_PPR = !!process.env.__NEXT_EXPERIMENTAL_PPR

describe('dynamic-io', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  const itSkipTurbopack = isTurbopack ? it.skip : it

  if (isNextDev && !WITH_PPR) {
    async function hasStaticIndicator(browser: BrowserInterface) {
      await browser.elementByCss('[data-nextjs-dev-tools-button]').click()

      return await browser.eval(
        () =>
          document
            .querySelector('nextjs-portal')
            .shadowRoot.querySelector('[data-nextjs-route-type]')
            .getAttribute('data-nextjs-route-type') === 'static'
      )
    }

    it('should not have static indicator on dynamic method route', async () => {
      const browser = await next.browser('/cases/dynamic_api_cookies')

      await retry(async () => {
        expect(await browser.eval('!!window.next.router ? "yes": "no"')).toBe(
          'yes'
        )
      })

      expect(await hasStaticIndicator(browser)).toBe(false)
    })

    it('should not have static indicator on dynamic IO route', async () => {
      const browser = await next.browser('/cases/fetch_mixed')

      await retry(async () => {
        expect(await browser.eval('!!window.next.router ? "yes": "no"')).toBe(
          'yes'
        )
      })

      expect(await hasStaticIndicator(browser)).toBe(false)
    })

    it('should have static indicator on static route', async () => {
      const browser = await next.browser('/cases/static')

      await retry(async () => {
        expect(await browser.eval('!!window.next.router ? "yes": "no"')).toBe(
          'yes'
        )
      })

      expect(await hasStaticIndicator(browser)).toBe(true)
    })

    it('should have static indicator on not-found route', async () => {
      const browser = await next.browser('/cases/not-found')

      await retry(async () => {
        expect(await browser.eval('!!window.next.router ? "yes": "no"')).toBe(
          'yes'
        )

        expect(await hasStaticIndicator(browser)).toBe(true)
      })
    })
  }

  it('should not have route specific errors', async () => {
    expect(next.cliOutput).not.toMatch('Error: Route "/')
    expect(next.cliOutput).not.toMatch('Error occurred prerendering page')
  })

  if (isNextDev) {
    it('should not log not-found errors', async () => {
      const cliOutputLength = next.cliOutput.length
      await next.browser('/cases/not-found')
      const cliOutput = next.cliOutput.slice(cliOutputLength)
      expect(cliOutput).not.toMatch('Error: NEXT_HTTP_ERROR_FALLBACK;404')
      expect(cliOutput).not.toMatch('unhandledRejection')
    })
  } else {
    it('should not warn about potential memory leak for even listeners on AbortSignal', async () => {
      expect(next.cliOutput).not.toMatch('MaxListenersExceededWarning')
    })
  }

  it('should prerender fully static pages', async () => {
    let $ = await next.render$('/cases/static', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }

    $ = await next.render$('/cases/static_async', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should prerender static not-found pages', async () => {
    // Using `browser` instead of `render$` because error pages must be hydrated
    // apparently.
    const browser = await next.browser('/cases/not-found')

    if (isNextDev) {
      expect(await browser.elementById('layout').text()).toBe('at runtime')
      expect(await browser.elementById('page').text()).toBe('at runtime')
    } else {
      expect(await browser.elementById('layout').text()).toBe('at buildtime')
      expect(await browser.elementById('page').text()).toBe('at buildtime')
    }
  })

  it('should prerender pages that render in a microtask', async () => {
    let $ = await next.render$('/cases/microtask', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }

    $ = await next.render$('/cases/microtask_deep_tree', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  if (WITH_PPR) {
    it('should partially prerender pages that take longer than a task to render', async () => {
      let $ = await next.render$('/cases/task', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        // The inner slot is computed during the prerender but is hidden
        // it gets revealed when the resume happens
        expect($('#inner').text()).toBe('at buildtime')
      }
    })
  } else {
    it('should not prerender pages that take longer than a single task to render', async () => {
      let $ = await next.render$('/cases/task', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        // The inner slot is computed during the prerender but is hidden
        // it gets revealed when the resume happens
        expect($('#inner').text()).toBe('at runtime')
      }
    })
  }

  it('should prerender pages that only use cached fetches', async () => {
    const $ = await next.render$('/cases/fetch_cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  if (WITH_PPR) {
    it('should partially prerender pages that use at least one fetch without cache', async () => {
      let $ = await next.render$('/cases/fetch_mixed', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
      }
    })
  } else {
    it('should not prerender pages that use at least one fetch without cache', async () => {
      let $ = await next.render$('/cases/fetch_mixed', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      }
    })
  }

  it('should prerender pages that only use cached (unstable_cache) IO', async () => {
    const $ = await next.render$('/cases/io_cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should prerender pages that only use cached ("use cache") IO', async () => {
    const $ = await next.render$('/cases/use_cache_cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  itSkipTurbopack(
    'should prerender pages that cached the whole page',
    async () => {
      const $ = await next.render$('/cases/full_cached', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
      }
    }
  )

  if (WITH_PPR) {
    it('should partially prerender pages that do any uncached IO', async () => {
      let $ = await next.render$('/cases/io_mixed', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
      }
    })
  } else {
    it('should not prerender pages that do any uncached IO', async () => {
      let $ = await next.render$('/cases/io_mixed', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that do any uncached IO (use cache)', async () => {
      let $ = await next.render$('/cases/use_cache_mixed', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
      }
    })
  } else {
    it('should not prerender pages that do any uncached IO (use cache)', async () => {
      let $ = await next.render$('/cases/use_cache_mixed', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use `cookies()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_cookies', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
        expect($('#value').text()).toBe('hello')
      }
    })
  } else {
    it('should not prerender pages that use `cookies()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_cookies', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use `headers()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_headers')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
        expect($('#value').text()).toBe('hello')
      }
    })
  } else {
    it('should not prerender pages that use `headers()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_headers')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      }
    })
  }

  it('should fully prerender pages that use `unstable_noStore()`', async () => {
    let $ = await next.render$('/cases/dynamic_api_no_store', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#inner').text()).toBe('at buildtime')
    }
  })

  if (WITH_PPR) {
    it('should partially prerender pages that use `searchParams` in Server Components', async () => {
      let $ = await next.render$(
        '/cases/dynamic_api_search_params_server?sentinel=my+sentinel',
        {}
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
        expect($('#value').text()).toBe('my sentinel')
      }
    })
  } else {
    it('should not prerender pages that use `searchParams` in Server Components', async () => {
      let $ = await next.render$(
        '/cases/dynamic_api_search_params_server?sentinel=my+sentinel',
        {}
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use `searchParams` in Client Components', async () => {
      let $ = await next.render$(
        '/cases/dynamic_api_search_params_client?sentinel=my+sentinel',
        {}
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        // The second component renders before the first one aborts so we end up
        // capturing the static value during buildtime
        expect($('#inner').text()).toBe('at buildtime')
        expect($('#value').text()).toBe('my sentinel')
      }
    })
  } else {
    it('should not prerender pages that use `searchParams` in Client Components', async () => {
      let $ = await next.render$(
        '/cases/dynamic_api_search_params_client?sentinel=my+sentinel',
        {}
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      }
    })
  }

  it('can prerender pages with parallel routes that are static', async () => {
    const $ = await next.render$('/cases/parallel/static', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page-slot').text()).toBe('at buildtime')
      expect($('#page-children').text()).toBe('at buildtime')
    }
  })

  it('can prerender pages with parallel routes that resolve in a microtask', async () => {
    const $ = await next.render$('/cases/parallel/microtask', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page-slot').text()).toBe('at buildtime')
      expect($('#page-children').text()).toBe('at buildtime')
    }
  })

  it('does not prerender pages with parallel routes that resolve in a task', async () => {
    const $ = await next.render$('/cases/parallel/task', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      if (WITH_PPR) {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page-slot').text()).toBe('at runtime')
        expect($('#page-children').text()).toBe('at buildtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page-slot').text()).toBe('at runtime')
        expect($('#page-children').text()).toBe('at runtime')
      }
    }
  })

  it('does not prerender pages with parallel routes that uses a dynamic API', async () => {
    let $ = await next.render$('/cases/parallel/no-store', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page-slot').text()).toBe('at buildtime')
      expect($('#page-children').text()).toBe('at buildtime')
    }

    $ = await next.render$('/cases/parallel/cookies', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      if (WITH_PPR) {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page-slot').text()).toBe('at runtime')
        expect($('#page-children').text()).toBe('at buildtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page-slot').text()).toBe('at runtime')
        expect($('#page-children').text()).toBe('at runtime')
      }
    }
  })
})
