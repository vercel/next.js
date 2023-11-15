import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'should render loading.js with url props',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should render loading.js with searchParams and params props', async () => {
      const $ = await next.render$(
        '/url-data/my-awesome-slug?first=value&second=other%20value'
      )
      const element = $('#loading-url-data')
      expect(element.text()).toBe('Search Params Loading...')
      expect(element.attr('data-params-slug')).toBe('my-awesome-slug')
      expect(element.attr('data-search-params-first')).toBe('value')
      expect(element.attr('data-search-params-second')).toBe('other value')
    })
  }
)
