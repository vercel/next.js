import { setupTests } from './util'

describe('with latest sharp', () => {
  setupTests({})
})

// @force-gate imageSandbox
describe('with sandboxed sharp', () => {
  setupTests({ nextConfigExperimental: { imgOptWorker: true } })
})
