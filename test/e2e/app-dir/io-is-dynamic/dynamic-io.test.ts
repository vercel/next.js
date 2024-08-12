import { nextTestSetup } from 'e2e-utils'

process.env.__TEST_SENTINEL = 'build'

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
    // This will update the __TEST_SENTINEL value to "run"
    await next.render('/setenv?value=run')
  })

  it('should prerender fully static pages', async () => {
    const $ = await next.render$('/cases/static', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('build')
    }
  })

  it('should prerender pages that render in a microtask', async () => {
    let $ = await next.render$('/cases/microtask', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('build')
    }

    $ = await next.render$('/cases/microtask_deep_tree', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('build')
    }
  })

  it('should not prerender pages that take longer than a single task to render', async () => {
    let $ = await next.render$('/cases/task_at_root', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }

    $ = await next.render$('/cases/task_at_boundary', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }
  })

  it('should prerender pages that only use cached fetches', async () => {
    const $ = await next.render$('/cases/fetch_cached', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('build')
    }
  })

  it('should not prerender pages that only use fetch without cache', async () => {
    const $ = await next.render$('/cases/fetch_mixed', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }
  })

  it('should prerender pages that only use cached (unstable_cache) IO', async () => {
    const $ = await next.render$('/cases/io_cached', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('build')
    }
  })

  it('should not prerender pages that do any uncached IO', async () => {
    const $ = await next.render$('/cases/io_mixed', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }
  })

  it('should not prerender pages that use `cookies()`', async () => {
    const $ = await next.render$('/cases/dynamic_api_cookies', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }
  })

  it('should not prerender pages that use `headers()`', async () => {
    const $ = await next.render$('/cases/dynamic_api_headers', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }
  })

  it('should not prerender pages that use `unstable_noStore()`', async () => {
    const $ = await next.render$('/cases/dynamic_api_no_store', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }
  })

  it('should not prerender pages that use `searchParams` in Server Components', async () => {
    const $ = await next.render$('/cases/dynamic_api_search_params_server', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }
  })

  it('should not prerender pages that use `searchParams` in Client Components', async () => {
    const $ = await next.render$('/cases/dynamic_api_search_params_client', {})
    if (isNextDev) {
      expect($('#sentinel').text()).toBe('run')
    } else {
      expect($('#sentinel').text()).toBe('run')
    }
  })
})
