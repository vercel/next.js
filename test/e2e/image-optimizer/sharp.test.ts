import { setupTests } from './util'

describe('with default image worker selection', () => {
  setupTests({})
})

describe('with image subprocesses disabled', () => {
  setupTests({ nextConfigExperimental: { imgOptWorker: false } })
})

// @force-gate imageSandbox
describe('with sandboxed sharp', () => {
  setupTests({ nextConfigExperimental: { imgOptWorker: true } })
})
