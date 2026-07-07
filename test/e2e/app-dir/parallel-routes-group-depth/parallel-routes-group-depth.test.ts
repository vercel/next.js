import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-group-depth', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render a page with a parallel slot and children in a route group', async () => {
    const $ = await next.render$('/parallel-group-depths-shallow-slot-hole')
    expect($('#slot-page').text()).toBe('Slot Page')
    expect($('#children-page').text()).toBe('Children (route group) page')
  })
})
