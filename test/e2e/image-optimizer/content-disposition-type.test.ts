import { setupTests } from './util'

describe('with contentDispositionType inline', () => {
  setupTests({
    nextConfigImages: { contentDispositionType: 'inline' },
  })
})
