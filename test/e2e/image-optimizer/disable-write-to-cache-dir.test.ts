import { setupTests } from './util'

describe('with isrFlushToDisk false config', () => {
  setupTests({
    nextConfigExperimental: { isrFlushToDisk: false },
  })
})
