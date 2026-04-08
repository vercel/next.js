import { nextTestSetup } from 'e2e-utils'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

describe('unstable_io with cache components', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/cache-components',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should make content after unstable_io() dynamic during prerender', async () => {
    const $ = await next.render$('/io-boundary')
    if (isNextDev) {
      // In dev mode everything renders at runtime
      expect($('#before').text()).toBe('at runtime')
      expect($('#after-io').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      // In production with cache components, unstable_io() creates a dynamic
      // boundary. Content in the static shell is rendered at buildtime.
      // Content after unstable_io() is rendered at request time because the
      // hanging promise prevented it from executing during the build prerender.
      expect($('#before').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#after-io').text()).toBe('at runtime')
    }
  })

  it('should resolve immediately inside a "use cache" scope', async () => {
    const $ = await next.render$('/io-in-cache')
    if (isNextDev) {
      expect($('#cached-value').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      // unstable_io() inside "use cache" is a no-op so the cached value is
      // computed at cache-fill time during the build
      expect($('#cached-value').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should work in pages router with getServerSideProps (CC)', async () => {
    const $ = await next.render$('/pages-gssp')
    expect($('#pages-content').text()).toBe('ok')
  })

  it('should work in pages router with getStaticProps (CC)', async () => {
    const $ = await next.render$('/pages-gsp')
    expect($('#pages-content').text()).toBe('ok')
  })

  /* eslint-disable jest/no-standalone-expect */
  ;(isReact18 ? it.skip : it)(
    'should work in pages router with React.use() (CC)',
    async () => {
      const $ = await next.render$('/pages-use')
      expect($('#pages-content').text()).toBe('ok')
    }
  )
  /* eslint-enable jest/no-standalone-expect */
})

describe('unstable_io without cache components', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/default',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should be a no-op during prerender without cache components', async () => {
    const $ = await next.render$('/io-boundary')
    if (isNextDev) {
      expect($('#before').text()).toBe('at runtime')
      expect($('#after-io').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      // Without cache components, unstable_io() resolves immediately during
      // prerendering so the entire page is fully static
      expect($('#before').text()).toBe('at buildtime')
      expect($('#after-io').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should work in pages router with getServerSideProps', async () => {
    const $ = await next.render$('/pages-gssp')
    expect($('#pages-content').text()).toBe('ok')
  })

  it('should work in pages router with getStaticProps', async () => {
    const $ = await next.render$('/pages-gsp')
    expect($('#pages-content').text()).toBe('ok')
  })

  /* eslint-disable jest/no-standalone-expect */
  ;(isReact18 ? it.skip : it)(
    'should work in pages router with React.use()',
    async () => {
      const $ = await next.render$('/pages-use')
      expect($('#pages-content').text()).toBe('ok')
    }
  )
  /* eslint-enable jest/no-standalone-expect */
})
