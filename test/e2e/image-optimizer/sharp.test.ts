import { setupTests } from './util'

describe('with latest sharp', () => {
  setupTests({})
})

describe('with sandboxed sharp', () => {
  setupTests({ nextConfigExperimental: { imgOptWorker: true } })
})
