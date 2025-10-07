import { nextTestSetup } from 'e2e-utils'

describe('cache-components', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should partially prerender pages that await searchParams in a server component', async () => {
    let $ = await next.render$('/search/server/await?sentinel=hello')
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#value').text()).toBe('hello')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('main').text()).toContain('inner loading...')
      expect($('main').text()).not.toContain('outer loading...')
      expect($('#value').text()).toBe('hello')
      expect($('#page').text()).toBe('at runtime')
    }
  })

  it('should partially prerender pages that `use` searchParams in a server component', async () => {
    let $ = await next.render$('/search/server/use?sentinel=hello')
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#value').text()).toBe('hello')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('main').text()).toContain('inner loading...')
      expect($('main').text()).not.toContain('outer loading...')
      expect($('#value').text()).toBe('hello')
      expect($('#page').text()).toBe('at runtime')
    }
  })

  it('should partially prerender pages that `use` searchParams in a client component', async () => {
    let $ = await next.render$('/search/client/use?sentinel=hello')
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#value').text()).toBe('hello')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('main').text()).toContain('inner loading...')
      expect($('main').text()).not.toContain('outer loading...')
      expect($('#value').text()).toBe('hello')
      expect($('#page').text()).toBe('at runtime')
    }
  })
})
