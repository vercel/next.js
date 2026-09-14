import { setupTests } from './util'

describe('with dangerouslyAllowSVG config', () => {
  setupTests({
    nextConfigImages: { dangerouslyAllowSVG: true },
  })
})
