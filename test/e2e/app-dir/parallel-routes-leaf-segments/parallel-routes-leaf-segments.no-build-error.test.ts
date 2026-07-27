import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-leaf-segments-no-build-error', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'no-build-error'),
  })

  it('should build successfully without default.tsx for leaf segments', async () => {
    // This test verifies that the build does not throw
    // MissingDefaultParallelRouteError for leaf segments
    expect(next.cliOutput).not.toContain('MissingDefaultParallelRouteError')
  })

  afterAll(() => {
    if (next.cliOutput.includes('MissingDefaultParallelRouteError')) {
      throw new Error('MissingDefaultParallelRouteError was thrown')
    }
  })

  describe('leaf segment without child routes', () => {
    it('should render the leaf segment page with all parallel slots', async () => {
      const $ = await next.render$('/leaf-segment')

      // Verify main page content
      expect($('h2').text()).toBe('Leaf Segment Page')
      expect($('.main p').first().text()).toContain(
        'This is a leaf segment with parallel routes but NO child routes'
      )

      // Verify all parallel slots render
      expect($('.header h3').text()).toBe('Header Slot')
      expect($('.sidebar h3').text()).toBe('Sidebar Slot')
      expect($('.metrics h3').text()).toBe('Metrics Slot')
    })
  })

  describe('leaf segment with route groups', () => {
    it('should render leaf segment with route groups and parallel slots', async () => {
      const $ = await next.render$('/leaf-with-groups')

      // Verify main page content
      expect($('h3').first().text()).toBe('Grouped Leaf Segment Page')

      // Verify route groups are handled correctly
      expect($('p').first().text()).toContain('route groups')

      // Verify parallel slots render
      expect($('.analytics h4').text()).toBe('Analytics Slot')
      expect($('.reports h4').text()).toBe('Reports Slot')
    })
  })

  describe('leaf segment with catch-all parameter', () => {
    it('should render catch-all segment with multiple path segments', async () => {
      const $ = await next.render$('/catch-all-with-parallel/a/b/c')

      // Verify main page content
      expect($('h2').text()).toBe('Catch-All Leaf Segment Page')

      // Verify the slug captures all segments
      expect($('.slug-info').text()).toBe('Current path: /a/b/c')

      // Verify parallel slots still render correctly
      expect($('.header h3').text()).toBe('Catch-All Header Slot')
      expect($('.footer h3').text()).toBe('Catch-All Footer Slot')
    })
  })

  describe('no children slot', () => {
    it('should render the no children slot', async () => {
      const $ = await next.render$('/no-children/other')

      expect($('#slot').text()).toBe('No Children Other Page')
      expect($('#children').text()).toBe('No Children Default')
    })
  })
})
