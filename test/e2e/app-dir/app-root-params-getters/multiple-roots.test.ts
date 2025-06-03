import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app-root-param-getters - multiple roots', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'multiple-roots'),
  })

  it('should have root params on dashboard pages', async () => {
    const $ = await next.render$('/1/data')
    expect($('body').text()).toContain('Dashboard Root')
    expect($('p').text()).toBe('hello world {"id":"1"}')
  })

  it('should not have root params on marketing pages', async () => {
    const $ = await next.render$('/landing')
    expect($('body').text()).toContain('Marketing Root')
    expect($('p').text()).toBe('hello world {}')
  })
})
