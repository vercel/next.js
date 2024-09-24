import { nextTestSetup } from 'e2e-utils'

const WITH_PPR = !!process.env.__NEXT_EXPERIMENTAL_PPR

describe('dynamic-io', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should prerender fully static pages', async () => {
    let $ = await next.render$('/cases/static', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else if (WITH_PPR) {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }

    $ = await next.render$('/cases/static_async', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else if (WITH_PPR) {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should prerender pages that render in a microtask', async () => {
    let $ = await next.render$('/cases/microtask', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else if (WITH_PPR) {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }

    $ = await next.render$('/cases/microtask_deep_tree', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else if (WITH_PPR) {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  if (WITH_PPR) {
    it('should partially prerender pages that take longer than a task to render', async () => {
      let $ = await next.render$('/cases/task_boundary', {})
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

      $ = await next.render$('/cases/task_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  } else {
    it('should not prerender pages that take longer than a single task to render', async () => {
      let $ = await next.render$('/cases/task_boundary', {})
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

      $ = await next.render$('/cases/task_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
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
      let $ = await next.render$('/cases/fetch_mixed_boundary', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
      }

      $ = await next.render$('/cases/fetch_mixed_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  } else {
    it('should not prerender pages that use at least one fetch without cache', async () => {
      let $ = await next.render$('/cases/fetch_mixed_boundary', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      }

      $ = await next.render$('/cases/fetch_mixed_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
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

  if (WITH_PPR) {
    it('should partially prerender pages that do any uncached IO', async () => {
      let $ = await next.render$('/cases/io_mixed_boundary', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
      }

      $ = await next.render$('/cases/io_mixed_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  } else {
    it('should not prerender pages that do any uncached IO', async () => {
      let $ = await next.render$('/cases/io_mixed_boundary', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      }

      $ = await next.render$('/cases/io_mixed_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use `cookies()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_cookies_boundary', {})
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

      $ = await next.render$('/cases/dynamic_api_cookies_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      }
    })
  } else {
    it('should not prerender pages that use `cookies()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_cookies_boundary', {})
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

      $ = await next.render$('/cases/dynamic_api_cookies_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use `headers()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_headers_boundary')
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

      $ = await next.render$('/cases/dynamic_api_headers_root')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      }
    })
  } else {
    it('should not prerender pages that use `headers()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_headers_boundary')
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

      $ = await next.render$('/cases/dynamic_api_headers_root')
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('hello')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use `unstable_noStore()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_no_store_boundary', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at buildtime')
        expect($('#page').text()).toBe('at buildtime')
        expect($('#inner').text()).toBe('at buildtime')
      }

      $ = await next.render$('/cases/dynamic_api_no_store_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  } else {
    it('should not prerender pages that use `unstable_noStore()`', async () => {
      let $ = await next.render$('/cases/dynamic_api_no_store_boundary', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#inner').text()).toBe('at runtime')
      }

      $ = await next.render$('/cases/dynamic_api_no_store_root', {})
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use `searchParams` in Server Components', async () => {
      let $ = await next.render$(
        '/cases/dynamic_api_search_params_server_boundary?sentinel=my+sentinel',
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

      $ = await next.render$(
        '/cases/dynamic_api_search_params_server_root?sentinel=my+sentinel',
        {}
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      }
    })
  } else {
    it('should not prerender pages that use `searchParams` in Server Components', async () => {
      let $ = await next.render$(
        '/cases/dynamic_api_search_params_server_boundary?sentinel=my+sentinel',
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

      $ = await next.render$(
        '/cases/dynamic_api_search_params_server_root?sentinel=my+sentinel',
        {}
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      }
    })
  }

  if (WITH_PPR) {
    it('should partially prerender pages that use `searchParams` in Client Components', async () => {
      let $ = await next.render$(
        '/cases/dynamic_api_search_params_client_boundary?sentinel=my+sentinel',
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

      $ = await next.render$(
        '/cases/dynamic_api_search_params_client_root?sentinel=my+sentinel',
        {}
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      }
    })
  } else {
    it('should not prerender pages that use `searchParams` in Client Components', async () => {
      let $ = await next.render$(
        '/cases/dynamic_api_search_params_client_boundary?sentinel=my+sentinel',
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

      $ = await next.render$(
        '/cases/dynamic_api_search_params_client_root?sentinel=my+sentinel',
        {}
      )
      if (isNextDev) {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      } else {
        expect($('#layout').text()).toBe('at runtime')
        expect($('#page').text()).toBe('at runtime')
        expect($('#value').text()).toBe('my sentinel')
      }
    })
  }
})
