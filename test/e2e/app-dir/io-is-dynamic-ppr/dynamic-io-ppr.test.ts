import { nextTestSetup } from 'e2e-utils'

process.env.__TEST_SENTINEL = 'at buildtime'

describe('dynamic-io', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  beforeAll(async () => {
    await next.start()
    await next.render('/bootstrap_runtime')
  })

  it('should prerender fully static pages', async () => {
    const $ = await next.render$('/cases/static', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
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

  it('should not prerender pages that take longer than a single task to render', async () => {
    let $ = await next.render$('/cases/task_boundary', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
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

  it('should not prerender pages that only use fetch without cache', async () => {
    let $ = await next.render$('/cases/fetch_mixed_boundary', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
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

  it('should not prerender pages that do any uncached IO', async () => {
    let $ = await next.render$('/cases/io_mixed_boundary', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
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

  it('should not prerender pages that use `cookies()`', async () => {
    let $ = await next.render$('/cases/dynamic_api_cookies_boundary', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      // @TODO why is the cookie set in bootstrap_runtime not being read here?
      expect($('#value').text()).toBe('~not-found~')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      // @TODO why is the cookie set in bootstrap_runtime not being read here?
      expect($('#value').text()).toBe('~not-found~')
    }

    $ = await next.render$('/cases/dynamic_api_cookies_root', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      // @TODO why is the cookie set in bootstrap_runtime not being read here?
      expect($('#value').text()).toBe('~not-found~')
    } else {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      // @TODO why is the cookie set in bootstrap_runtime not being read here?
      expect($('#value').text()).toBe('~not-found~')
    }
  })

  it('should not prerender pages that use `headers()`', async () => {
    let $ = await next.render$(
      '/cases/dynamic_api_headers_boundary',
      {},
      {
        headers: {
          'x-sentinel': 'my sentinel',
        },
      }
    )
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#value').text()).toBe('my sentinel')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#value').text()).toBe('my sentinel')
    }

    $ = await next.render$(
      '/cases/dynamic_api_headers_root',
      {},
      {
        headers: {
          'x-sentinel': 'my sentinel',
        },
      }
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

  it('should not prerender pages that use `unstable_noStore()`', async () => {
    let $ = await next.render$('/cases/dynamic_api_no_store_boundary', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
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

  it('should not prerender pages that use `searchParams` in Server Components', async () => {
    let $ = await next.render$(
      '/cases/dynamic_api_search_params_server_boundary?sentinel=my+sentinel',
      {}
    )
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#value').text()).toBe('my sentinel')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
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

  it('should not prerender pages that use `searchParams` in Client Components', async () => {
    let $ = await next.render$(
      '/cases/dynamic_api_search_params_client_boundary?sentinel=my+sentinel',
      {}
    )
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#value').text()).toBe('my sentinel')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
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
})
